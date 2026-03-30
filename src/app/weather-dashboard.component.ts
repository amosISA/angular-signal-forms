import { JsonPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, debounced, signal } from '@angular/core';
import { withPreviousValue } from './with-previous-value';

/**
 * Weather data shape returned by our /api/weather endpoint.
 */
type WeatherData = {
  city: string;
  country: string;
  region: string;
  localTime: string;
  temperature: {
    celsius: number;
    fahrenheit: number;
    feelsLikeCelsius: number;
    feelsLikeFahrenheit: number;
  };
  condition: {
    text: string;
    icon: string;
  };
  wind: {
    kph: number;
    mph: number;
    direction: string;
  };
  humidity: number;
  cloud: number;
  uv: number;
  visibility: {
    km: number;
    miles: number;
  };
};

type CityOption = {
  name: string;
  emoji: string;
};

const CITIES: CityOption[] = [
  { name: 'London', emoji: '🇬🇧' },
  { name: 'Tokyo', emoji: '🇯🇵' },
  { name: 'New York', emoji: '🇺🇸' },
  { name: 'Paris', emoji: '🇫🇷' },
  { name: 'Sydney', emoji: '🇦🇺' },
  { name: 'Dubai', emoji: '🇦🇪' },
  { name: 'São Paulo', emoji: '🇧🇷' },
  { name: 'Mumbai', emoji: '🇮🇳' },
];

@Component({
  selector: 'app-weather-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 p-4 md:p-8">
      <div class="max-w-5xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold text-gray-800 mb-2">🌍 City Weather Dashboard</h1>
          <p class="text-gray-600 max-w-2xl mx-auto">
            Demonstrating Angular 22's
            <code class="bg-gray-200 px-1.5 py-0.5 rounded text-sm font-mono">debounced()</code>
            signal utility alongside
            <code class="bg-gray-200 px-1.5 py-0.5 rounded text-sm font-mono"
              >Resource Composition via Snapshots</code
            >.
          </p>
        </div>

        <!-- Mode Toggle -->
        <div class="flex justify-center mb-6">
          <div class="bg-white rounded-xl shadow-md p-1 inline-flex gap-1">
            <button
              type="button"
              (click)="useSnapshotComposition.set(true)"
              class="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              [class.bg-blue-600]="useSnapshotComposition()"
              [class.text-white]="useSnapshotComposition()"
              [class.text-gray-600]="!useSnapshotComposition()"
              [class.hover:bg-gray-100]="!useSnapshotComposition()"
            >
              ✅ With Snapshot Composition
            </button>
            <button
              type="button"
              (click)="useSnapshotComposition.set(false)"
              class="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              [class.bg-red-500]="!useSnapshotComposition()"
              [class.text-white]="!useSnapshotComposition()"
              [class.text-gray-600]="useSnapshotComposition()"
              [class.hover:bg-gray-100]="useSnapshotComposition()"
            >
              ❌ Without (raw httpResource)
            </button>
          </div>
        </div>

        <!-- Search Input — debounced() in action -->
        <div class="max-w-md mx-auto mb-6">
          <div class="relative">
            <input
              type="text"
              [value]="searchInput()"
              (input)="searchInput.set($any($event.target).value)"
              placeholder="Type a city name to search..."
              class="w-full px-4 py-3 pl-10 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-gray-800 shadow-sm"
            />
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            @if (debouncedSearch.isLoading()) {
              <span
                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-500 font-medium animate-pulse"
              >
                debouncing...
              </span>
            }
          </div>
          <div class="flex items-center justify-between mt-2 px-1">
            <p class="text-xs text-gray-500">
              Debounced value:
              <code class="bg-gray-200 px-1 rounded font-mono">{{ debouncedSearch.value() }}</code>
            </p>
            <p
              class="text-xs font-mono"
              [class.text-blue-500]="debouncedSearch.isLoading()"
              [class.text-green-600]="!debouncedSearch.isLoading()"
            >
              {{ debouncedSearch.status() }}
            </p>
          </div>
        </div>

        <!-- City Selector (quick picks) -->
        <div class="flex flex-wrap justify-center gap-3 mb-8">
          @for (city of cities; track city.name) {
            <button
              type="button"
              (click)="searchInput.set(city.name)"
              class="px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm border-2"
              [class.bg-blue-600]="selectedCity() === city.name"
              [class.text-white]="selectedCity() === city.name"
              [class.border-blue-600]="selectedCity() === city.name"
              [class.shadow-blue-200]="selectedCity() === city.name"
              [class.shadow-md]="selectedCity() === city.name"
              [class.bg-white]="selectedCity() !== city.name"
              [class.text-gray-700]="selectedCity() !== city.name"
              [class.border-gray-200]="selectedCity() !== city.name"
              [class.hover:border-blue-300]="selectedCity() !== city.name"
              [class.hover:bg-blue-50]="selectedCity() !== city.name"
            >
              {{ city.emoji }} {{ city.name }}
            </button>
          }
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <!-- Weather Card -->
          <div class="relative">
            <!-- Loading overlay — visible when resource is loading -->
            @if (activeResource().isLoading()) {
              <div
                class="absolute inset-0 bg-white/60 backdrop-blur-sm rounded-2xl z-10 flex items-center justify-center"
              >
                <div class="flex flex-col items-center gap-3">
                  <div
                    class="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"
                  ></div>
                  <span class="text-sm font-medium text-blue-700">
                    Loading {{ selectedCity() }}...
                  </span>
                </div>
              </div>
            }

            <!-- Weather data card — .value() keeps the OLD data during loading when using snapshots! -->
            @if (activeResource().value(); as weather) {
              <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
                <!-- City Header -->
                <div class="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-5 text-white">
                  <div class="flex items-center justify-between">
                    <div>
                      <h2 class="text-2xl font-bold">{{ weather.city }}</h2>
                      <p class="text-blue-100 text-sm">
                        {{ weather.country }}
                        @if (weather.region) {
                          · {{ weather.region }}
                        }
                      </p>
                    </div>
                    <div class="text-right">
                      <div class="text-4xl font-light">{{ weather.temperature.celsius }}°C</div>
                      <p class="text-blue-100 text-sm">
                        Feels like {{ weather.temperature.feelsLikeCelsius }}°C
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Condition -->
                <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                  <img
                    [src]="'https:' + weather.condition.icon"
                    [alt]="weather.condition.text"
                    width="48"
                    height="48"
                  />
                  <span class="text-lg text-gray-700">{{ weather.condition.text }}</span>
                </div>

                <!-- Stats Grid -->
                <div class="grid grid-cols-2 gap-px bg-gray-100">
                  <div class="bg-white px-5 py-4">
                    <p class="text-xs text-gray-500 uppercase tracking-wide">Wind</p>
                    <p class="text-lg font-semibold text-gray-800">
                      {{ weather.wind.kph }} km/h {{ weather.wind.direction }}
                    </p>
                  </div>
                  <div class="bg-white px-5 py-4">
                    <p class="text-xs text-gray-500 uppercase tracking-wide">Humidity</p>
                    <p class="text-lg font-semibold text-gray-800">{{ weather.humidity }}%</p>
                  </div>
                  <div class="bg-white px-5 py-4">
                    <p class="text-xs text-gray-500 uppercase tracking-wide">UV Index</p>
                    <p class="text-lg font-semibold text-gray-800">{{ weather.uv }}</p>
                  </div>
                  <div class="bg-white px-5 py-4">
                    <p class="text-xs text-gray-500 uppercase tracking-wide">Visibility</p>
                    <p class="text-lg font-semibold text-gray-800">
                      {{ weather.visibility.km }} km
                    </p>
                  </div>
                  <div class="bg-white px-5 py-4 col-span-2">
                    <p class="text-xs text-gray-500 uppercase tracking-wide">Local Time</p>
                    <p class="text-lg font-semibold text-gray-800">{{ weather.localTime }}</p>
                  </div>
                </div>
              </div>
            } @else if (activeResource().status() === 'error') {
              <div class="bg-white rounded-2xl shadow-lg p-8 text-center">
                <div class="text-4xl mb-3">⚠️</div>
                <p class="text-red-600 font-medium">Failed to load weather data</p>
                <p class="text-gray-500 text-sm mt-1">Please try again or select another city.</p>
              </div>
            } @else if (!activeResource().isLoading()) {
              <div class="bg-white rounded-2xl shadow-lg p-8 text-center">
                <div class="text-4xl mb-3">🌤��</div>
                <p class="text-gray-500">Select a city to see its weather</p>
              </div>
            } @else {
              <!-- Pure loading state (no previous data) — only shows on first load -->
              <div class="bg-white rounded-2xl shadow-lg p-8">
                <div class="animate-pulse space-y-4">
                  <div class="bg-gray-200 h-24 rounded-xl"></div>
                  <div class="bg-gray-200 h-12 rounded-lg"></div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="bg-gray-200 h-16 rounded-lg"></div>
                    <div class="bg-gray-200 h-16 rounded-lg"></div>
                    <div class="bg-gray-200 h-16 rounded-lg"></div>
                    <div class="bg-gray-200 h-16 rounded-lg"></div>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Explanation Panel -->
          <div class="space-y-4">
            <!-- Live Resource State -->
            <div class="bg-white rounded-2xl shadow-lg p-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-3">📊 Live Resource State</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">Status:</span>
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-bold"
                    [class.bg-blue-100]="
                      activeResource().status() === 'loading' ||
                      activeResource().status() === 'reloading'
                    "
                    [class.text-blue-700]="
                      activeResource().status() === 'loading' ||
                      activeResource().status() === 'reloading'
                    "
                    [class.bg-green-100]="activeResource().status() === 'resolved'"
                    [class.text-green-700]="activeResource().status() === 'resolved'"
                    [class.bg-gray-100]="activeResource().status() === 'idle'"
                    [class.text-gray-700]="activeResource().status() === 'idle'"
                    [class.bg-red-100]="activeResource().status() === 'error'"
                    [class.text-red-700]="activeResource().status() === 'error'"
                  >
                    {{ activeResource().status() }}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">isLoading:</span>
                  <span
                    class="font-mono text-xs"
                    [class.text-blue-600]="activeResource().isLoading()"
                    [class.text-gray-400]="!activeResource().isLoading()"
                  >
                    {{ activeResource().isLoading() }}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">hasValue:</span>
                  <span
                    class="font-mono text-xs"
                    [class.text-green-600]="activeResource().hasValue()"
                    [class.text-gray-400]="!activeResource().hasValue()"
                  >
                    {{ activeResource().hasValue() }}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">value()?.city:</span>
                  <span class="font-mono text-xs text-gray-800">
                    {{ activeResource().value()?.city ?? 'undefined' }}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">Mode:</span>
                  <span
                    class="font-mono text-xs"
                    [class.text-blue-600]="useSnapshotComposition()"
                    [class.text-red-500]="!useSnapshotComposition()"
                  >
                    {{ useSnapshotComposition() ? 'withPreviousValue()' : 'raw httpResource' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Debounced Signal State — NEW -->
            <div class="bg-white rounded-2xl shadow-lg p-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-3">⏱️ Debounced Signal State</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">Raw input:</span>
                  <span class="font-mono text-xs text-gray-800"> "{{ searchInput() }}" </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">Debounced value:</span>
                  <span class="font-mono text-xs text-gray-800">
                    "{{ debouncedSearch.value() }}"
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">Debounce status:</span>
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-bold"
                    [class.bg-blue-100]="debouncedSearch.status() === 'loading'"
                    [class.text-blue-700]="debouncedSearch.status() === 'loading'"
                    [class.bg-green-100]="debouncedSearch.status() === 'resolved'"
                    [class.text-green-700]="debouncedSearch.status() === 'resolved'"
                  >
                    {{ debouncedSearch.status() }}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">Wait time:</span>
                  <span class="font-mono text-xs text-gray-800">500ms</span>
                </div>
              </div>
              <div class="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p class="text-xs text-amber-800">
                  💡 <strong>debounced()</strong> returns a
                  <code class="bg-amber-100 px-1 rounded">Resource&lt;T&gt;</code> — its
                  <code class="bg-amber-100 px-1 rounded">status</code> is
                  <code class="bg-amber-100 px-1 rounded">'loading'</code> while waiting, then
                  <code class="bg-amber-100 px-1 rounded">'resolved'</code> once settled. Type fast
                  and watch the status change!
                </p>
              </div>
            </div>

            <!-- How It Works -->
            <div class="bg-white rounded-2xl shadow-lg p-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-3">🔄 How It Works</h3>
              @if (useSnapshotComposition()) {
                <div class="space-y-3 text-sm text-gray-600">
                  <p>
                    <strong class="text-gray-800">With snapshot composition + debounced()</strong>:
                  </p>
                  <ol class="list-decimal list-inside space-y-1.5 ml-1">
                    <li>User types → raw signal updates immediately</li>
                    <li>
                      <code class="text-xs bg-gray-100 px-1 rounded">debounced()</code> waits 500ms
                      (status:
                      <code class="text-xs bg-blue-100 text-blue-700 px-1 rounded">'loading'</code>)
                    </li>
                    <li>
                      After 500ms, debounced value settles (status:
                      <code class="text-xs bg-green-100 text-green-700 px-1 rounded"
                        >'resolved'</code
                      >)
                    </li>
                    <li>
                      <code class="text-xs bg-gray-100 px-1 rounded">httpResource</code> fires with
                      the settled city name
                    </li>
                    <li>
                      <code class="text-xs bg-gray-100 px-1 rounded">withPreviousValue()</code>
                      keeps old data visible while loading ✨
                    </li>
                  </ol>
                  <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p class="text-xs text-blue-800 font-mono leading-relaxed">
                      signal → debounced() → httpResource → withPreviousValue() → UI
                    </p>
                  </div>
                </div>
              } @else {
                <div class="space-y-3 text-sm text-gray-600">
                  <p><strong class="text-gray-800">Without snapshot composition</strong>:</p>
                  <ol class="list-decimal list-inside space-y-1.5 ml-1">
                    <li>User types → debounced() still waits 500ms ✅</li>
                    <li>
                      <code class="text-xs bg-gray-100 px-1 rounded">httpResource</code> fires
                    </li>
                    <li>
                      <code class="text-xs bg-gray-100 px-1 rounded">value()</code> becomes
                      <code class="text-xs bg-red-100 text-red-700 px-1 rounded">undefined</code>
                      immediately
                    </li>
                    <li>The weather card disappears — blank screen / skeleton</li>
                  </ol>
                  <div class="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
                    <p class="text-xs text-red-700">
                      ⚡ Try switching cities rapidly — notice the jarring flash of empty content!
                    </p>
                  </div>
                </div>
              }
            </div>

            <!-- Snapshot Debug -->
            <div class="bg-white rounded-2xl shadow-lg p-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-3">🔍 Raw Snapshot</h3>
              <pre class="text-xs bg-gray-50 rounded-lg p-3 overflow-auto max-h-40 text-gray-700">{{
                snapshotDebug() | json
              }}</pre>
            </div>
          </div>
        </div>

        <!-- Back link -->
        <div class="text-center mt-8">
          <a href="/" class="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline">
            ← Back to Weather Chatbot
          </a>
        </div>
      </div>
    </div>
  `,
})
export class WeatherDashboardComponent {
  protected readonly cities = CITIES;
  protected readonly useSnapshotComposition = signal(true);

  /**
   * Raw search input — updates on every keystroke.
   */
  protected readonly searchInput = signal('London');

  /**
   * Angular 22: debounced() — creates a Resource<T> from a signal with debouncing.
   *
   * While the user is typing, debouncedSearch.status() is 'loading'.
   * Once 500ms passes without changes, it settles to 'resolved' with the final value.
   * This prevents firing an HTTP request on every keystroke.
   */
  protected readonly debouncedSearch = debounced(() => this.searchInput(), 500);

  /**
   * The settled city name — only updates after the debounce period.
   * This is what drives the httpResource.
   */
  protected readonly selectedCity = computed(() => this.debouncedSearch.value() ?? 'London');

  /**
   * Raw httpResource — fetches weather data reactively when selectedCity changes.
   * Because selectedCity is derived from debounced(), this only fires after the user
   * stops typing for 500ms.
   */
  private readonly _rawWeatherResource = httpResource<WeatherData>(
    () => `http://localhost:3000/api/weather?city=${encodeURIComponent(this.selectedCity())}`,
  );

  /**
   * Composed resource using withPreviousValue() — the snapshot composition pattern.
   * When the city changes, value() KEEPS the old data while isLoading() is true.
   */
  private readonly _composedWeatherResource = withPreviousValue(this._rawWeatherResource);

  /**
   * Switch between the two resources based on the toggle.
   * This lets users see the difference in real-time.
   */
  protected readonly activeResource = computed(() =>
    this.useSnapshotComposition() ? this._composedWeatherResource : this._rawWeatherResource,
  );

  /**
   * Debug view of the current snapshot for the explanation panel.
   */
  protected readonly snapshotDebug = computed(() => {
    const res = this.activeResource();
    return {
      status: res.status(),
      isLoading: res.isLoading(),
      hasValue: res.hasValue(),
      city: res.hasValue() ? res.value()?.city : null,
      debouncedStatus: this.debouncedSearch.status(),
      debouncedValue: this.debouncedSearch.value(),
    };
  });
}
