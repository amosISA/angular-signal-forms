const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Correct package name

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI - Note: no need to pass apiKey in constructor
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Weather AI Server is running' });
});

// Chat endpoint for weather queries
app.post('/api/chat', async (req, res) => {
  const { message, conversationHistory } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Get the model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Build chat or single generation
    let result;

    if (conversationHistory && conversationHistory.length > 0) {
      // If there's history, use chat
      const chat = model.startChat({
        history: conversationHistory,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 1000,
        },
      });

      result = await chat.sendMessage(message);
    } else {
      // First message, use generateContent
      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 1000,
        },
      });
    }

    const generatedText = result.response.text();

    res.json({
      response: generatedText,
      usage: result.response.usageMetadata,
    });
  } catch (error) {
    console.error('Error generating chat response:', error);
    res.status(500).json({
      error: 'Failed to generate response',
      details: error.message,
    });
  }
});

// Weather validation endpoint
app.get('/api/validate-city', async (req, res) => {
  const { city, country } = req.query;

  if (!city || !country) {
    return res.status(400).json({ error: 'City and country are required' });
  }

  try {
    const weatherApiKey = process.env.WEATHER_API_KEY;
    const url = `https://api.weatherapi.com/v1/search.json?key=${weatherApiKey}&q=${encodeURIComponent(city)},${encodeURIComponent(country)}`;

    const response = await fetch(url);
    const results = await response.json();

    res.json(results);
  } catch (error) {
    console.error('Error validating city:', error);
    res.status(500).json({ error: 'Failed to validate city' });
  }
});

// Weather preview endpoint
app.get('/api/weather-preview', async (req, res) => {
  const { city, country } = req.query;

  if (!city || !country) {
    return res.status(400).json({ error: 'City and country are required' });
  }

  try {
    const weatherApiKey = process.env.WEATHER_API_KEY;
    // Use the current weather endpoint instead of search
    const url = `https://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${encodeURIComponent(city)},${encodeURIComponent(country)}`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).json({ error: 'City not found' });
    }

    const data = await response.json();

    // Extract and format the preview data
    const preview = {
      temp: Math.round(data.current.temp_c),
      conditions: data.current.condition.text,
      icon: getWeatherIcon(data.current.condition.text)
    };

    res.json(preview);
  } catch (error) {
    console.error('Error fetching weather preview:', error);
    res.status(500).json({ error: 'Failed to fetch weather preview' });
  }
});

// Helper function to map weather conditions to emojis
function getWeatherIcon(condition) {
  const conditionLower = condition.toLowerCase();

  if (conditionLower.includes('sunny') || conditionLower.includes('clear')) return '☀️';
  if (conditionLower.includes('partly cloudy')) return '⛅';
  if (conditionLower.includes('cloudy') || conditionLower.includes('overcast')) return '☁️';
  if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) return '🌧️';
  if (conditionLower.includes('storm') || conditionLower.includes('thunder')) return '⛈️';
  if (conditionLower.includes('snow')) return '🌨️';
  if (conditionLower.includes('fog') || conditionLower.includes('mist')) return '🌫️';
  if (conditionLower.includes('wind')) return '💨';

  return '🌤️'; // Default
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Weather AI Server running on http://localhost:${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
