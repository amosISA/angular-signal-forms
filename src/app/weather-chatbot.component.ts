import { JsonPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  apply,
  applyEach,
  customError,
  debounce,
  Field,
  form,
  FormRoot,
  submit,
  validateAsync,
  validateTree,
} from '@angular/forms/signals';
import { delay, firstValueFrom, of, switchMap, tap } from 'rxjs';
import { ChatService } from './chat.service';
import { ChatMessage, NetworkError, WeatherApiError, WeatherFormData } from './types';
import { weatherFormSchema } from './weather-form.schemas';

@Component({
  selector: 'app-weather-chatbot',
  templateUrl: './weather-chatbot.component.html',
  // Angular 21.2: FormRoot directive for declarative form submission
  imports: [Field, FormRoot, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherChatbotComponent {
  private readonly _chatService = inject(ChatService);
  private readonly _http = inject(HttpClient);

  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly isSubmitting = signal(false);
  // Angular 21.2: instanceof in templates — track last error for type-based rendering
  protected readonly lastError = signal<Error | null>(null);

  protected readonly messageCount = computed(() => this.messages().length);
  protected readonly isDevelopment = signal(true);

  // Angular 21.2: Expose error classes for instanceof checks in templates
  protected readonly WeatherApiError = WeatherApiError;
  protected readonly NetworkError = NetworkError;

  private readonly _weatherData = signal<WeatherFormData>({
    date: new Date().toISOString().split('T')[0],
    locations: [{ city: '', country: '' }],
    temperatureUnit: 'celsius',
  });

  private readonly _cityValidationCache = new Map<string, unknown>();

  private _getCacheKey(city: string, country: string): string {
    return `${city.toLowerCase()}_${country.toLowerCase()}`;
  }

  // Angular 21.2: FormRoot + submission options — submit logic lives in form() config
  protected readonly weatherForm = form(
    this._weatherData,
    (path) => {
      apply(path, weatherFormSchema);

      // Async validation for city verification
      applyEach(path.locations, (location) => {
        debounce(location.city, 500);

        validateAsync(location.city, {
          params: (ctx) => {
            const city = ctx.value();
            const country = ctx.fieldTreeOf(location.country)().value();

            if (!city || city.length < 2 || !country || country.length < 2) {
              return undefined;
            }

            return { city, country };
          },

          factory: (params) => {
            return rxResource({
              params,
              stream: (p) => {
                if (!p.params) return of(null);

                const { city, country } = p.params;
                const cacheKey = this._getCacheKey(city, country);

                if (this._cityValidationCache.has(cacheKey)) {
                  return of(this._cityValidationCache.get(cacheKey));
                }

                const url = `http://localhost:3000/api/validate-city?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}`;

                return of(null).pipe(
                  delay(500),
                  switchMap(() => this._http.get(url)),
                  tap((results) => {
                    this._cityValidationCache.set(cacheKey, results);
                  }),
                );
              },
            });
          },

          onSuccess: (results, ctx) => {
            if (!results || (results as unknown[]).length === 0) {
              return customError({
                kind: 'city_not_found',
                message: `Could not find "${ctx.value()}" in weather database`,
              });
            }

            const resultArray = results as { name: string; country: string }[];
            const exactMatch = resultArray.some(
              (r) =>
                r.name.toLowerCase() === ctx.value().toLowerCase() &&
                r.country.toLowerCase() ===
                  ctx.fieldTreeOf(location.country)().value().toLowerCase(),
            );

            if (!exactMatch) {
              return customError({
                kind: 'city_country_mismatch',
                message: `"${ctx.value()}" does not exist in ${ctx
                  .fieldTreeOf(location.country)()
                  .value()}`,
              });
            }

            return null;
          },

          onError: (_error, _ctx) => {
            console.error('City validation error:', _error);
            return customError({
              kind: 'validation_error',
              message: 'Unable to validate city. Please try again.',
            });
          },
        });
      });

      // Tree validator for duplicate detection
      validateTree(path, (ctx) => {
        const errors: {
          kind: string;
          field: unknown;
          message: string;
        }[] = [];
        const locations = ctx.value().locations;

        locations.forEach((location, index) => {
          const city = location.city.valueOf();
          const country = location.country.valueOf();

          if (!city || !country) return;

          locations.forEach((otherLocation, otherIndex) => {
            if (index !== otherIndex) {
              if (
                city === otherLocation.city.valueOf() &&
                country === otherLocation.country.valueOf()
              ) {
                errors.push({
                  kind: 'duplicate_location',
                  field: ctx.field.locations[index].city,
                  message: `Duplicate location: ${city}, ${country}`,
                });
              }
            }
          });
        });

        return errors.length > 0 ? errors : null;
      });
    },
    {
      // Angular 21.2: Form-level submission options
      submission: {
        action: async (_field) => {
          const formData = this._weatherData();
          const query = this._buildWeatherQuery(formData);
          this._addUserMessage(query);
          await this._sendMessageToAI(query);
        },
        // Angular 21.2: onInvalid receives the field — focus first invalid field
        onInvalid: (field) => {
          field.focus();
        },
      },
    },
  );

  protected addLocation(): void {
    this._weatherData.update((data) => ({
      ...data,
      locations: [...data.locations, { city: '', country: '' }],
    }));
  }

  protected removeLocation(index: number): void {
    this._weatherData.update((data) => ({
      ...data,
      locations: data.locations.filter((_, i) => i !== index),
    }));
  }

  // Angular 21.2: Manual submit fallback (FormRoot handles this automatically now)
  protected onManualSubmit(): void {
    submit(this.weatherForm);
  }

  protected shouldShowErrors(fieldErrors: unknown[], fieldTouched: boolean): boolean {
    return fieldErrors.length > 0 && fieldTouched;
  }

  protected dismissError(): void {
    this.lastError.set(null);
  }

  private _buildWeatherQuery(data: WeatherFormData): string {
    const date = new Date(data.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const unit = data.temperatureUnit === 'celsius' ? '°C' : '°F';
    const locationsList = data.locations.map((loc) => `${loc.city}, ${loc.country}`).join(' and ');

    return `What's the weather forecast for ${locationsList} on ${date}? Please provide the temperature in ${unit}.`;
  }

  private _addUserMessage(content: string): void {
    const userMessage: ChatMessage = {
      id: this._generateId(),
      content,
      role: 'user',
      timestamp: new Date(),
    };

    this.messages.update((messages) => [...messages, userMessage]);
  }

  private async _sendMessageToAI(query: string): Promise<void> {
    this.isSubmitting.set(true);
    this.lastError.set(null);

    const loadingMessage: ChatMessage = {
      id: this._generateId(),
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      isLoading: true,
    };

    this.messages.update((messages) => [...messages, loadingMessage]);

    try {
      const response = await firstValueFrom(this._chatService.sendMessage(query));

      this.messages.update((messages) =>
        messages.map((msg) =>
          msg.id === loadingMessage.id ? { ...msg, content: response, isLoading: false } : msg,
        ),
      );
    } catch (error) {
      // Angular 21.2: instanceof — categorize errors for type-based template rendering
      if (error instanceof HttpErrorResponse) {
        this.lastError.set(new WeatherApiError(error.message, error.status));
      } else if (error instanceof TypeError && error.message.includes('fetch')) {
        this.lastError.set(new NetworkError());
      } else {
        this.lastError.set(error instanceof Error ? error : new Error('Unknown error'));
      }

      this.messages.update((messages) =>
        messages.map((msg) =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content: 'Sorry, I encountered an error. Please try again.',
                isLoading: false,
              }
            : msg,
        ),
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private _generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
