export type WeatherLocation = {
  city: string;
  country: string;
};

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
