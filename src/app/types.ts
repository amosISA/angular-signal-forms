export type WeatherLocation = {
  city: string;
  country: string;
};

// Angular 21.2: Using union type for exhaustive @switch checks in templates
export type TemperatureUnit = 'celsius' | 'fahrenheit';

export type MessageRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  content: string;
  role: MessageRole;
  timestamp: Date;
  isLoading?: boolean;
};

export type WeatherFormData = {
  date: string;
  locations: WeatherLocation[];
  temperatureUnit: TemperatureUnit;
};

// Angular 21.2: Custom error class for instanceof checks in templates
export class WeatherApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'WeatherApiError';
  }
}

export class NetworkError extends Error {
  constructor(message: string = 'Network connection failed') {
    super(message);
    this.name = 'NetworkError';
  }
}
