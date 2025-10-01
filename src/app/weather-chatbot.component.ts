import { JsonPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  applyEach,
  Control,
  customError,
  form,
  minLength,
  required,
  validate,
  validateAsync,
  validateTree,
} from '@angular/forms/signals';
import { delay, of, switchMap, tap } from 'rxjs';
import { ChatService } from './chat.service';
import { ConfigService } from './config.service';
import { WeatherLocation } from './multi-location-weather.component';

type TemperatureUnit = 'celsius' | 'fahrenheit';

type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isLoading?: boolean;
};

type WeatherFormData = {
  date: string;
  locations: WeatherLocation[];
  temperatureUnit: TemperatureUnit;
};

@Component({
  selector: 'app-weather-chatbot',
  templateUrl: './weather-chatbot.component.html',
  imports: [Control, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherChatbotComponent {
  private readonly _chatService = inject(ChatService);
  private readonly _config = inject(ConfigService);
  private readonly _http = inject(HttpClient);

  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly isSubmitting = signal(false);

  protected readonly messageCount = computed(() => this.messages().length);
  protected readonly isDevelopment = signal(true);

  private readonly _weatherData = signal<WeatherFormData>({
    date: new Date().toISOString().split('T')[0],
    locations: [{ city: '', country: '' }],
    temperatureUnit: 'celsius',
  });

  private readonly _cityValidationCache = new Map<string, any>();

  private _getCacheKey(city: string, country: string): string {
    return `${city.toLowerCase()}_${country.toLowerCase()}`;
  }

  protected readonly weatherForm = form(this._weatherData, (path) => {
    required(path.date, { message: 'Date is required' });

    applyEach(path.locations, (location) => {
      required(location.city, { message: 'City is required' });
      minLength(location.city, 2, { message: 'City must be at least 2 characters' });
      required(location.country, { message: 'Country is required' });
      minLength(location.country, 2, { message: 'Country must be at least 2 characters' });

      validateAsync(location.city, {
        params: (ctx) => {
          const city = ctx.value();
          const country = ctx.fieldOf(location.country)().value();

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

              // Check cache first
              if (this._cityValidationCache.has(cacheKey)) {
                console.log(`Using cached result for ${cacheKey}`);
                return of(this._cityValidationCache.get(cacheKey));
              }

              const apiKey = this._config.get('WEATHER_API_KEY');
              const url = `https://api.weatherapi.com/v1/search.json?key=${apiKey}&q=${encodeURIComponent(
                city,
              )},${encodeURIComponent(country)}`;

              return of(null).pipe(
                delay(2000),
                switchMap(() => this._http.get(url)),
                tap((results) => {
                  // Store in cache after successful fetch
                  this._cityValidationCache.set(cacheKey, results);
                }),
              );
            },
          });
        },
        errors: (results, ctx) => {
          console.log(results);
          if (!results || results.length === 0) {
            return customError({
              kind: 'city_not_found',
              message: `Could not find "${ctx.value()}" in weather database`,
            });
          }

          const exactMatch = results.some(
            (r: any) =>
              r.name.toLowerCase() === ctx.value().toLowerCase() &&
              r.country.toLowerCase() === ctx.fieldOf(location.country)().value().toLowerCase(),
          );

          if (!exactMatch) {
            return customError({
              kind: 'city_country_mismatch',
              message: `"${ctx.value()}" does not exist in ${ctx
                .fieldOf(location.country)()
                .value()}`,
            });
          }
          return null;
        },
      });
    });

    // Tree validator for duplicate locations
    validateTree(path, (ctx) => {
      const errors: any[] = [];
      const locations = ctx.value().locations;

      locations.forEach((location, index) => {
        const city = location.city.valueOf();
        const country = location.country.valueOf();

        // Skip empty values
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

    // Array validation
    validate(path.locations, (ctx) => {
      if (ctx.value().length === 0) {
        return customError({
          kind: 'empty_array',
          message: 'At least one location is required',
        });
      }
      return null;
    });

    required(path.temperatureUnit, { message: 'Temperature unit is required' });
  });

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

  protected onSubmitWeatherQuery(): void {
    if (!this.weatherForm().valid()) {
      this._markAllFieldsAsTouched();
      return;
    }

    const formData = this._weatherData();
    const query = this._buildWeatherQuery(formData);

    this._addUserMessage(query);
    this._sendMessageToAI(query);
  }

  private _markAllFieldsAsTouched(): void {
    this.weatherForm.date().markAsTouched();
    this.weatherForm.temperatureUnit().markAsTouched();

    for (const location of this.weatherForm.locations) {
      location.city().markAsTouched();
      location.country().markAsTouched();
    }
  }

  protected shouldShowErrors(fieldErrors: any[], fieldTouched: boolean): boolean {
    return fieldErrors.length > 0 && fieldTouched;
  }

  private _buildWeatherQuery(data: WeatherFormData): string {
    const date = new Date(data.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const unit = data.temperatureUnit === 'celsius' ? '°C' : '°F';

    // Build query for all locations
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

    const loadingMessage: ChatMessage = {
      id: this._generateId(),
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      isLoading: true,
    };

    this.messages.update((messages) => [...messages, loadingMessage]);

    try {
      const response = await this._chatService.sendMessage(query);

      this.messages.update((messages) =>
        messages.map((msg) =>
          msg.id === loadingMessage.id ? { ...msg, content: response, isLoading: false } : msg,
        ),
      );
    } catch (error) {
      this.messages.update((messages) =>
        messages.map((msg) =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content:
                  'Sorry, I encountered an error while fetching the weather data. Please try again.',
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
