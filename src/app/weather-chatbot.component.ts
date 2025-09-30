import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { applyEach, Control, form, minLength, required } from '@angular/forms/signals';
import { ChatService } from './chat.service';
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

  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly isSubmitting = signal(false);

  protected readonly messageCount = computed(() => this.messages().length);
  protected readonly isDevelopment = signal(true);

  private readonly _weatherData = signal<WeatherFormData>({
    date: new Date().toISOString().split('T')[0],
    locations: [{ city: '', country: '' }],
    temperatureUnit: 'celsius',
  });

  protected readonly weatherForm = form(this._weatherData, (path) => {
    required(path.date, { message: 'Date is required' });

    applyEach(path.locations, (location) => {
      required(location.city, { message: 'City is required' });
      minLength(location.city, 2, { message: 'City must be at least 2 characters' });
      required(location.country, { message: 'Country is required' });
      minLength(location.country, 2, { message: 'Country must be at least 2 characters' });
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
          msg.id === loadingMessage.id ? { ...msg, content: response, isLoading: false } : msg
        )
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
            : msg
        )
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
