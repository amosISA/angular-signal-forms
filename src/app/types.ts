import { WeatherLocation } from './multi-location-weather.component';

export type TemperatureUnit = 'celsius' | 'fahrenheit';

export type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isLoading?: boolean;
};

export type WeatherFormData = {
  date: string;
  locations: WeatherLocation[];
  temperatureUnit: TemperatureUnit;
};

export type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenAIResponse = {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};
