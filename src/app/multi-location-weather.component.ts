import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { applyEach, Control, form, minLength, required } from '@angular/forms/signals';

export type WeatherLocation = {
  city: string;
  country: string;
};

type MultiLocationWeatherData = {
  locations: WeatherLocation[];
  temperatureUnit: 'celsius' | 'fahrenheit';
};

@Component({
  selector: 'app-multi-location-weather',
  templateUrl: './multi-location-weather.component.html',
  imports: [CommonModule, Control],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiLocationWeatherComponent {
  private readonly _weatherData = signal<MultiLocationWeatherData>({
    locations: [{ city: '', country: '' }],
    temperatureUnit: 'celsius',
  });

  protected readonly weatherForm = form(this._weatherData, (path) => {
    applyEach(path.locations, (location) => {
      required(location.city, { message: 'City is required' });
      minLength(location.city, 2, { message: 'City must be at least 2 characters' });
      required(location.country, { message: 'Country is required' });
      minLength(location.country, 2, { message: 'Country must be at least 2 characters' });
    });

    required(path.temperatureUnit);
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
}
