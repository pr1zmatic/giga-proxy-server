// main.ts - ФИНАЛЬНАЯ ВЕРСИЯ с правильным портом

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// --- КОНФИГУРАЦИЯ GIGACHAT ---
// Адрес для получения токена
const GIGA_TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
// Адрес самого чат-API
const GIGA_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// --- ПОЛУЧАЕМ СЕКРЕТЫ ИЗ ОКРУЖЕНИЯ ---
// Ваш "Authorization Key" (ClientID:ClientSecret в Base64)
const GIGA_AUTH_CREDENTIALS = Deno.env.get("GIGA_AUTH_CREDENTIALS"); 
// Ваш секретный ключ для защиты прокси
const PROXY_SECRET_KEY = Deno.env.get("PROXY_SECRET_KEY");
// Область доступа (scope), обязательный параметр для GigaChat
const GIGA_SCOPE = "GIGACHAT_API_PERS";

// --- УПРАВЛЕНИЕ ВРЕМЕННЫМ ТОКЕНОМ ---
// Здесь мы будем хранить наш временный токен и время его жизни
let accessToken: string | null = null;
let tokenExpiresAt = 0; // Время в миллисекундах

// Функция для получения или обновления токена
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }
  console.log("Requesting new GigaChat access token...");
  const response = await fetch(GIGA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${GIGA_AUTH_CREDENTIALS}`,
      "RqUID": crypto.randomUUID(),
    },
    body: `scope=${GIGA_SCOPE}`,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }
  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000; 
  console.log("Successfully received new access token.");
  return accessToken;
}

// --- ОСНОВНОЙ СЕРВЕР ---
const unsafeClient = Deno.createHttpClient({
  unsafelyIgnoreCertificateErrors: true,
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
  if (!GIGA_AUTH_CREDENTIALS || !PROXY_SECRET_KEY) {
    console.error("Server configuration error: Secrets are not set.");
    return new Response("Server configuration error.", { status: 500 });
  }
  if (req.method !== 'POST' || req.headers.get("Authorization") !== `Bearer ${PROXY_SECRET_KEY}`) {
    return new Response("Unauthorized.", { status: 401 });
  }
  try {
    const token = await getAccessToken();
    const requestBody = await req.json();
    const gigaResponse = await fetch(GIGA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      client: unsafeClient,
    });
    if (!gigaResponse.ok) {
      const errorText = await gigaResponse.text();
      console.error("GigaChat API Error:", errorText);
      return new Response(errorText, { status: gigaResponse.status });
    }
    const responseData = await gigaResponse.json();
    return new Response(JSON.stringify(responseData), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  // deno-lint-ignore no-explicit-any
  } catch (error: any) {
    console.error("Proxy internal error:", error);
    return new Response(error.message, { status: 500 });
  }
};

// --- ЗАПУСК СЕРВЕРА ---
// Вот это изменение! Мы читаем порт из окружения.
const port = parseInt(Deno.env.get("PORT") ?? "8000");
console.log(`Listening on http://localhost:${port}/`);
serve(handler, { port });