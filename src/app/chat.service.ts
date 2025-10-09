import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

type ChatResponse = {
  response: string;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
};

type ConversationMessage = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = 'http://localhost:3000/api';

  // Store conversation history for context
  private _conversationHistory: ConversationMessage[] = [];

  sendMessage(message: string): Observable<string> {
    return this._http
      .post<ChatResponse>(`${this._apiUrl}/chat`, {
        message,
        conversationHistory: this._conversationHistory,
      })
      .pipe(
        map((response) => {
          // Update conversation history
          this._conversationHistory.push({
            role: 'user',
            parts: [{ text: message }],
          });

          this._conversationHistory.push({
            role: 'model',
            parts: [{ text: response.response }],
          });

          return response.response;
        }),
        catchError((error) => {
          console.error('Chat error:', error);
          return of('Sorry, I encountered an error. Please try again.');
        }),
      );
  }

  clearHistory(): void {
    this._conversationHistory = [];
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this._conversationHistory];
  }
}
