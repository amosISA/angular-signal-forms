import { Injectable } from '@angular/core';

export type AppConfig = {
  AI_STUDIO_API_KEY: string;
  WEATHER_API_KEY: string;
};

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private _config: AppConfig | null = null;

  async loadConfig(): Promise<void> {
    try {
      const response = await fetch('/app-config.json');
      this._config = await response.json();
    } catch (error) {
      console.error('Could not load config', error);
    }
  }

  get(key: keyof AppConfig): string | null {
    return this._config ? this._config[key] : null;
  }
}
