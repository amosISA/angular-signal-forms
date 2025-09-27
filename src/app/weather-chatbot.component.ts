import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatService } from './chat.service';

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
  country: string;
  city: string;
  temperatureUnit: TemperatureUnit;
};

@Component({
  selector: 'app-weather-chatbot',
  templateUrl: './weather-chatbot.component.html',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherChatbotComponent {
  private readonly _formBuilder = inject(FormBuilder);
  private readonly _chatService = inject(ChatService);

  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly isSubmitting = signal(false);

  protected readonly messageCount = computed(() => this.messages().length);
  protected readonly formValue = computed(() => this.weatherForm.value);
  protected readonly isDevelopment = signal(false);

  protected readonly weatherForm: FormGroup = this._formBuilder.group({
    date: ['', Validators.required],
    country: ['', [Validators.required, Validators.minLength(2)]],
    city: ['', [Validators.required, Validators.minLength(2)]],
    temperatureUnit: ['celsius', Validators.required] as [TemperatureUnit, any],
  });

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.weatherForm.patchValue({ date: today });
  }

  protected onSubmitWeatherQuery(): void {
    if (this.weatherForm.invalid) {
      this.weatherForm.markAllAsTouched();
      return;
    }

    const formData = this.weatherForm.value as WeatherFormData;
    const query = this._buildWeatherQuery(formData);

    this._addUserMessage(query);
    this._sendMessageToAI(query);
  }

  private _buildWeatherQuery(data: WeatherFormData): string {
    const date = new Date(data.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const unit = data.temperatureUnit === 'celsius' ? '°C' : '°F';

    return `What's the weather forecast for ${data.city}, ${data.country} on ${date}? Please provide the temperature in ${unit}.`;
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
