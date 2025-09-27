import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WeatherChatbotComponent } from './weather-chatbot.component';

@Component({
  selector: 'app-root',
  imports: [WeatherChatbotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-weather-chatbot />`,
})
export class AppComponent {}
