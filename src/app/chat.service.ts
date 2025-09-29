import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';

type GeminiPart = {
  text: string;
};

type GeminiContent = {
  parts: GeminiPart[];
  role?: 'user' | 'model';
};

type GeminiRequest = {
  contents: GeminiContent[];
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
};

type GeminiResponse = {
  candidates: Array<{
    content: {
      parts: GeminiPart[];
      role: string;
    };
    finishReason: string;
  }>;
};

type ChatConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
};

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly _configService = inject(ConfigService);
  private readonly _http = inject(HttpClient);

  private readonly _config = signal<ChatConfig>({
    apiKey: this._configService.get('AI_STUDIO_API_KEY') || '',
    model: 'gemini-2.5-flash',
    baseUrl: '',
    maxTokens: 500,
    temperature: 0.7,
  });

  readonly hasApiKey = computed(() => !!this._config().apiKey);
  readonly currentModel = computed(() => this._config().model);
  readonly isConfigured = computed(() => this.hasApiKey() && this._config().model.length > 0);

  private readonly _systemPrompt = `You are a helpful weather assistant. You provide accurate, informative, and friendly responses about weather forecasts, conditions, and related topics.

Key instructions:
- Provide specific weather information when possible
- Include helpful context about weather patterns
- Be conversational and friendly
- If you don't have real-time weather data, acknowledge this and provide general guidance
- Include relevant weather safety tips when appropriate
- Format your responses in a clear, easy-to-read manner

Remember: You're helping users understand weather conditions and forecasts for their specific locations and dates.`;

  async sendMessage(userMessage: string): Promise<string> {
    const config = this._config();

    // Always use mock responses if no API key or if using mock model
    if (!config.apiKey || config.model === 'mock') {
      return this._getMockWeatherResponse(userMessage);
    }

    try {
      const fullPrompt = `${this._systemPrompt}\n\nUser: ${userMessage}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

      console.log('Calling URL:', url);

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      });
      console.log('Headers:', headers);

      const body: GeminiRequest = {
        contents: [
          {
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
        },
      };

      const response = await firstValueFrom(
        this._http.post<GeminiResponse>(url, body, { headers })
      );

      const responseText = response.candidates[0]?.content?.parts?.[0]?.text;
      return responseText || "Sorry, I couldn't generate a response.";
    } catch (error) {
      console.error('Gemini API Error:', error);
      return this._getMockWeatherResponse(userMessage);
    }
  }

  setApiKey(apiKey: string): void {
    this._config.update((config) => ({ ...config, apiKey }));
  }

  updateConfig(newConfig: Partial<ChatConfig>): void {
    this._config.update((config) => ({ ...config, ...newConfig }));
  }

  getConfig() {
    return this._config.asReadonly();
  }

  private _getMockWeatherResponse(userMessage: string): string {
    // Extract location and date info from the message for mock response
    const locationMatch = userMessage.match(/for (.+?) on/i);
    const dateMatch = userMessage.match(/on (.+?)\?/i);
    const unitMatch = userMessage.match(/(°C|°F)/);

    const location = locationMatch ? locationMatch[1] : 'the requested location';
    const date = dateMatch ? dateMatch[1] : 'the requested date';
    const unit = unitMatch ? unitMatch[1] : '°C';
    const temp =
      unit === '°F' ? Math.floor(Math.random() * 40) + 50 : Math.floor(Math.random() * 25) + 10;

    const conditions = ['sunny', 'partly cloudy', 'cloudy', 'light rain', 'clear skies'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];

    const responses = [
      `🌤️ Weather forecast for ${location} on ${date}:

**Temperature**: ${temp}${unit}
**Conditions**: ${condition}
**Humidity**: ${Math.floor(Math.random() * 40) + 40}%
**Wind**: ${Math.floor(Math.random() * 15) + 5} km/h

${this._getWeatherTip(condition)}

*Note: This is a demo response. Add your Google AI API key and switch to Gemini for real weather insights!*`,

      `Here's what I can tell you about the weather in ${location} on ${date}:

The temperature is expected to be around ${temp}${unit} with ${condition}. It's a great day to ${this._getActivitySuggestion(
        condition,
        temp,
        unit
      )}.

**Quick Details:**
• Temperature: ${temp}${unit}
• Sky: ${condition}
• Comfort level: ${this._getComfortLevel(temp, unit)}

*This is a demo response. Switch to Gemini model for real AI-powered weather insights!*`,

      `Weather update for ${location} 📍

Looking at ${date}, you can expect ${condition} conditions with temperatures around ${temp}${unit}. ${this._getClothingSuggestion(
        temp,
        unit
      )}

**Forecast Summary:**
- High: ${temp + 3}${unit}
- Low: ${temp - 5}${unit}
- Conditions: ${condition}
- Precipitation: ${Math.floor(Math.random() * 30)}%

${this._getPlanningTip(condition)}

*Demo mode active - switch to Gemini for personalized AI weather insights!*`,
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  private _getWeatherTip(condition: string): string {
    const tips: Record<string, string> = {
      sunny: "☀️ Great day for outdoor activities! Don't forget sunscreen.",
      'partly cloudy': '⛅ Perfect weather for a walk or outdoor lunch.',
      cloudy: '☁️ Comfortable weather, though you might not see much sun.',
      'light rain': '🌧️ You might want to carry an umbrella just in case.',
      'clear skies': '✨ Excellent visibility - perfect for stargazing tonight!',
    };
    return tips[condition] || 'Have a great day!';
  }

  private _getActivitySuggestion(condition: string, temp: number, unit: string): string {
    const isWarm = (unit === '°F' && temp > 70) || (unit === '°C' && temp > 20);

    if (condition.includes('rain')) {
      return 'enjoy indoor activities like visiting a museum or cozy café';
    } else if (isWarm && (condition === 'sunny' || condition === 'clear skies')) {
      return 'spend time outdoors, maybe have a picnic or go hiking';
    } else if (isWarm) {
      return 'take a leisurely walk or sit outside at a restaurant';
    } else {
      return "bundle up if you're heading out, or enjoy a warm drink indoors";
    }
  }

  private _getClothingSuggestion(temp: number, unit: string): string {
    if (unit === '°F') {
      if (temp >= 80) return 'Light clothing and shorts weather! 👕';
      if (temp >= 70) return 'Perfect for a t-shirt and jeans. 👖';
      if (temp >= 60) return "You'll want a light jacket or sweater. 🧥";
      if (temp >= 45) return 'Definitely wear a warm coat! 🧥';
      return "Bundle up with layers - it's cold! 🧣";
    } else {
      if (temp >= 27) return 'Light clothing and shorts weather! 👕';
      if (temp >= 20) return 'Perfect for a t-shirt and jeans. 👖';
      if (temp >= 15) return "You'll want a light jacket or sweater. 🧥";
      if (temp >= 7) return 'Definitely wear a warm coat! 🧥';
      return "Bundle up with layers - it's cold! 🧣";
    }
  }

  private _getComfortLevel(temp: number, unit: string): string {
    const levels = ['Very Cold', 'Cold', 'Cool', 'Comfortable', 'Warm', 'Hot', 'Very Hot'];

    if (unit === '°F') {
      if (temp < 32) return levels[0];
      if (temp < 50) return levels[1];
      if (temp < 60) return levels[2];
      if (temp < 75) return levels[3];
      if (temp < 85) return levels[4];
      if (temp < 95) return levels[5];
      return levels[6];
    } else {
      if (temp < 0) return levels[0];
      if (temp < 10) return levels[1];
      if (temp < 15) return levels[2];
      if (temp < 24) return levels[3];
      if (temp < 29) return levels[4];
      if (temp < 35) return levels[5];
      return levels[6];
    }
  }

  private _getPlanningTip(condition: string): string {
    const tips: Record<string, string> = {
      sunny: '💡 Tip: This is perfect weather for outdoor events or photography!',
      'partly cloudy': '💡 Tip: Great balance of sun and shade - ideal for most activities.',
      cloudy: '💡 Tip: Even lighting makes this good weather for outdoor photography.',
      'light rain': '💡 Tip: Indoor venues might be busier today - make reservations if needed.',
      'clear skies': '💡 Tip: Exceptional weather - perfect for special outdoor plans!',
    };
    return tips[condition] || '💡 Tip: Check the hourly forecast for more detailed planning.';
  }
}
