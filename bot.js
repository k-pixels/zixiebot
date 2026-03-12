require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) {
  console.error("❌  TELEGRAM_TOKEN not set in .env file!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const NASA_KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const WEATHER_KEY = process.env.WEATHER_API_KEY || null;

console.log("🤖 ZixieBot is running...");

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

async function sendTyping(chatId) {
  await bot.sendChatAction(chatId, "typing");
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || "there";
  const welcome = `
🌟 *Hey ${escapeMarkdown(name)}\\! I'm ZixieBot* 🌟

Your all\\-in\\-one search assistant\\! Here's what I can do:

🔍 */search \\<query\\>* — Wikipedia search
🖼 */image \\<prompt\\>* — Generate an AI image \\(Pollinations\\.AI\\)
☁️ */weather \\<city\\>* — Live weather info
📰 */news \\<topic\\>* — Latest news headlines
🌌 */nasa* — NASA astronomy picture of the day
😂 */joke* — Random programming joke
📖 */define \\<word\\>* — Dictionary definition
🌍 */translate \\<lang\\> \\<text\\>* — Translate text
💡 */fact* — Random interesting fact
🎬 */movie \\<title\\>* — Movie information
🐾 */animal \\<name\\>* — Animal facts
❓ */help* — Show this menu again

Just send a command and I'll get to work\\! ⚡
`;
  bot.sendMessage(msg.chat.id, welcome, { parse_mode: "MarkdownV2" });
});

// ─── /help ────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  bot.emit("text", { ...msg, text: "/start" });
});

// ─── /search — Wikipedia ──────────────────────────────────────────────────────
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();
  await sendTyping(chatId);

  try {
    // Search Wikipedia
    const searchRes = await axios.get("https://en.wikipedia.org/w/api.php", {
      params: {
        action: "query",
        list: "search",
        srsearch: query,
        format: "json",
        srlimit: 3,
      },
    });

    const results = searchRes.data.query.search;
    if (!results.length) {
      return bot.sendMessage(chatId, `😕 No Wikipedia results found for *${escapeMarkdown(query)}*`, { parse_mode: "MarkdownV2" });
    }

    // Get summary of top result
    const topTitle = results[0].title;
    const summaryRes = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle)}`);
    const data = summaryRes.data;

    const summary = data.extract ? data.extract.slice(0, 900) : "No summary available.";
    const pageUrl = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topTitle)}`;

    let reply = `📖 *${escapeMarkdown(data.title)}*\n\n${escapeMarkdown(summary)}`;
    if (summary.length >= 900) reply += "…";
    reply += `\n\n[🔗 Read more on Wikipedia](${pageUrl})`;

    // Also show other results
    if (results.length > 1) {
      reply += `\n\n*Other results:*`;
      for (let i = 1; i < results.length; i++) {
        const t = results[i].title;
        reply += `\n• [${escapeMarkdown(t)}](https://en.wikipedia.org/wiki/${encodeURIComponent(t)})`;
      }
    }

    // Send thumbnail if available
    if (data.thumbnail?.source) {
      await bot.sendPhoto(chatId, data.thumbnail.source, {
        caption: reply,
        parse_mode: "MarkdownV2",
      });
    } else {
      bot.sendMessage(chatId, reply, { parse_mode: "MarkdownV2", disable_web_page_preview: false });
    }
  } catch (err) {
    console.error(err.message);
    bot.sendMessage(chatId, "❌ Failed to fetch Wikipedia results. Try again!");
  }
});

// ─── /image — Pollinations.AI (FREE, no key needed) ──────────────────────────
bot.onText(/\/image (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const prompt = match[1].trim();
  await bot.sendChatAction(chatId, "upload_photo");

  try {
    const seed = Math.floor(Math.random() * 99999);
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=768&seed=${seed}&nologo=true`;

    await bot.sendPhoto(chatId, imageUrl, {
      caption: `🎨 *Generated Image*\n\n_Prompt: ${escapeMarkdown(prompt)}_\n\nPowered by Pollinations\\.AI ✨`,
      parse_mode: "MarkdownV2",
    });
  } catch (err) {
    console.error(err.message);
    bot.sendMessage(chatId, "❌ Image generation failed. Try a different prompt!");
  }
});

// ─── /weather — OpenWeatherMap ────────────────────────────────────────────────
bot.onText(/\/weather (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const city = match[1].trim();
  await sendTyping(chatId);

  if (!WEATHER_KEY) {
    return bot.sendMessage(
      chatId,
      "⚠️ Weather feature needs a free API key\\!\n\n1\\. Go to [openweathermap\\.org](https://openweathermap.org/api)\n2\\. Sign up for FREE\n3\\. Add `WEATHER_API_KEY=your_key` to your \\.env file",
      { parse_mode: "MarkdownV2" }
    );
  }

  try {
    const res = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
      params: { q: city, appid: WEATHER_KEY, units: "metric" },
    });
    const d = res.data;
    const emoji = getWeatherEmoji(d.weather[0].main);

    const reply = `
${emoji} *Weather in ${escapeMarkdown(d.name)}, ${escapeMarkdown(d.sys.country)}*

🌡 Temperature: *${d.main.temp}°C* \\(feels like ${d.main.feels_like}°C\\)
📊 Condition: *${escapeMarkdown(d.weather[0].description)}*
💧 Humidity: *${d.main.humidity}%*
🌬 Wind: *${d.wind.speed} m/s*
👁 Visibility: *${(d.visibility / 1000).toFixed(1)} km*
    `.trim();

    bot.sendMessage(chatId, reply, { parse_mode: "MarkdownV2" });
  } catch (err) {
    if (err.response?.status === 404) {
      bot.sendMessage(chatId, `❌ City "*${escapeMarkdown(city)}*" not found\\. Try another city name\\.`, { parse_mode: "MarkdownV2" });
    } else {
      bot.sendMessage(chatId, "❌ Weather fetch failed. Try again!");
    }
  }
});

function getWeatherEmoji(condition) {
  const map = { Clear: "☀️", Clouds: "☁️", Rain: "🌧", Drizzle: "🌦", Thunderstorm: "⛈", Snow: "❄️", Mist: "🌫", Fog: "🌫", Haze: "🌫" };
  return map[condition] || "🌤";
}

// ─── /news — GNews API (free tier) ────────────────────────────────────────────
bot.onText(/\/news(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic = match[1].trim() || "technology";
  await sendTyping(chatId);

  try {
    // Using NewsAPI.org free RSS via rss2json
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await axios.get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=5`);

    const items = res.data.items;
    if (!items || items.length === 0) {
      return bot.sendMessage(chatId, `😕 No news found for *${escapeMarkdown(topic)}*`, { parse_mode: "MarkdownV2" });
    }

    let reply = `📰 *Latest News: ${escapeMarkdown(topic)}*\n\n`;
    items.forEach((item, i) => {
      const title = escapeMarkdown(item.title.replace(/ - .*$/, "").trim());
      const link = item.link;
      reply += `${i + 1}\\. [${title}](${link})\n\n`;
    });

    bot.sendMessage(chatId, reply, { parse_mode: "MarkdownV2", disable_web_page_preview: true });
  } catch (err) {
    console.error(err.message);
    bot.sendMessage(chatId, "❌ Could not fetch news. Try again later!");
  }
});

// ─── /nasa — Astronomy Picture of the Day ────────────────────────────────────
bot.onText(/\/nasa/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendChatAction(chatId, "upload_photo");

  try {
    const res = await axios.get(`https://api.nasa.gov/planetary/apod?api_key=${NASA_KEY}`);
    const d = res.data;

    const caption = `🌌 *NASA Astronomy Picture of the Day*\n\n*${escapeMarkdown(d.title)}*\n_${escapeMarkdown(d.date)}_\n\n${escapeMarkdown(d.explanation.slice(0, 700))}${d.explanation.length > 700 ? "…" : ""}`;

    if (d.media_type === "image") {
      await bot.sendPhoto(chatId, d.hdurl || d.url, { caption, parse_mode: "MarkdownV2" });
    } else {
      bot.sendMessage(chatId, caption + `\n\n[▶️ Watch Video](${d.url})`, { parse_mode: "MarkdownV2" });
    }
  } catch (err) {
    console.error(err.message);
    bot.sendMessage(chatId, "❌ NASA API failed. Try again!");
  }
});

// ─── /joke — Programming Jokes ────────────────────────────────────────────────
bot.onText(/\/joke/, async (msg) => {
  const chatId = msg.chat.id;
  await sendTyping(chatId);

  try {
    const res = await axios.get("https://v2.jokeapi.dev/joke/Programming,Misc?blacklistFlags=nsfw,racist,sexist");
    const d = res.data;

    let joke;
    if (d.type === "single") {
      joke = `😂 ${escapeMarkdown(d.joke)}`;
    } else {
      joke = `😂 *${escapeMarkdown(d.setup)}*\n\n||${escapeMarkdown(d.delivery)}||`;
    }

    bot.sendMessage(chatId, joke, { parse_mode: "MarkdownV2" });
  } catch (err) {
    bot.sendMessage(chatId, "😅 Couldn't fetch a joke right now. Try again!");
  }
});

// ─── /define — Dictionary ─────────────────────────────────────────────────────
bot.onText(/\/define (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const word = match[1].trim().toLowerCase();
  await sendTyping(chatId);

  try {
    const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const entry = res.data[0];

    let reply = `📖 *${escapeMarkdown(entry.word)}*`;
    if (entry.phonetic) reply += ` \\(${escapeMarkdown(entry.phonetic)}\\)`;
    reply += "\n\n";

    entry.meanings.slice(0, 2).forEach((meaning) => {
      reply += `*${escapeMarkdown(meaning.partOfSpeech)}*\n`;
      meaning.definitions.slice(0, 2).forEach((def, i) => {
        reply += `${i + 1}\\. ${escapeMarkdown(def.definition)}\n`;
        if (def.example) reply += `   _"${escapeMarkdown(def.example)}"_\n`;
      });
      reply += "\n";
    });

    bot.sendMessage(chatId, reply, { parse_mode: "MarkdownV2" });
  } catch (err) {
    if (err.response?.status === 404) {
      bot.sendMessage(chatId, `❌ Word "*${escapeMarkdown(word)}*" not found in dictionary\\.`, { parse_mode: "MarkdownV2" });
    } else {
      bot.sendMessage(chatId, "❌ Dictionary lookup failed. Try again!");
    }
  }
});

// ─── /translate — MyMemory (Free, no key needed) ──────────────────────────────
bot.onText(/\/translate (\S+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const lang = match[1].toLowerCase();
  const text = match[2].trim();
  await sendTyping(chatId);

  // Language code map
  const langMap = {
    hindi: "hi", spanish: "es", french: "fr", german: "de",
    japanese: "ja", chinese: "zh", arabic: "ar", russian: "ru",
    portuguese: "pt", italian: "it", korean: "ko", urdu: "ur",
  };
  const langCode = langMap[lang] || lang;

  try {
    const res = await axios.get("https://api.mymemory.translated.net/get", {
      params: { q: text, langpair: `en|${langCode}` },
    });
    const translated = res.data.responseData.translatedText;

    const reply = `🌍 *Translation*\n\n*Original \\(EN\\):*\n${escapeMarkdown(text)}\n\n*${escapeMarkdown(lang.charAt(0).toUpperCase() + lang.slice(1))}:*\n${escapeMarkdown(translated)}`;
    bot.sendMessage(chatId, reply, { parse_mode: "MarkdownV2" });
  } catch (err) {
    bot.sendMessage(chatId, "❌ Translation failed. Use language names like: hindi, french, japanese");
  }
});

// ─── /fact — Random Interesting Facts ─────────────────────────────────────────
bot.onText(/\/fact/, async (msg) => {
  const chatId = msg.chat.id;
  await sendTyping(chatId);

  try {
    const res = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en");
    const fact = res.data.text;
    bot.sendMessage(chatId, `💡 *Random Fact*\n\n${escapeMarkdown(fact)}`, { parse_mode: "MarkdownV2" });
  } catch (err) {
    bot.sendMessage(chatId, "❌ Couldn't fetch a fact. Try again!");
  }
});

// ─── /movie — OMDb API (free) ─────────────────────────────────────────────────
bot.onText(/\/movie (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const title = match[1].trim();
  await sendTyping(chatId);

  try {
    // Uses OMDb free key
    const res = await axios.get(`https://www.omdbapi.com/`, {
      params: { t: title, apikey: "trilogy" },
    });
    const d = res.data;

    if (d.Response === "False") {
      return bot.sendMessage(chatId, `❌ Movie "*${escapeMarkdown(title)}*" not found\\.`, { parse_mode: "MarkdownV2" });
    }

    const reply = `🎬 *${escapeMarkdown(d.Title)}* \\(${escapeMarkdown(d.Year)}\\)\n\n⭐ IMDb: *${escapeMarkdown(d.imdbRating)}*\n🎭 Genre: ${escapeMarkdown(d.Genre)}\n🎬 Director: ${escapeMarkdown(d.Director)}\n⏱ Runtime: ${escapeMarkdown(d.Runtime)}\n\n📝 *Plot:*\n${escapeMarkdown(d.Plot)}`;

    if (d.Poster && d.Poster !== "N/A") {
      bot.sendPhoto(chatId, d.Poster, { caption: reply, parse_mode: "MarkdownV2" });
    } else {
      bot.sendMessage(chatId, reply, { parse_mode: "MarkdownV2" });
    }
  } catch (err) {
    bot.sendMessage(chatId, "❌ Movie lookup failed. Try again!");
  }
});

// ─── /animal — Open Facts (Wikipedia-backed) ──────────────────────────────────
bot.onText(/\/animal (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const animal = match[1].trim();
  await sendTyping(chatId);

  try {
    const res = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(animal)}`);
    const d = res.data;

    if (d.type === "disambiguation") {
      return bot.sendMessage(chatId, `🐾 Try a more specific animal name, like "/animal African elephant"`);
    }

    const summary = escapeMarkdown(d.extract?.slice(0, 800) || "No info found.");
    const reply = `🐾 *${escapeMarkdown(d.title)}*\n\n${summary}${d.extract?.length > 800 ? "…" : ""}`;

    if (d.thumbnail?.source) {
      bot.sendPhoto(chatId, d.thumbnail.source, { caption: reply, parse_mode: "MarkdownV2" });
    } else {
      bot.sendMessage(chatId, reply, { parse_mode: "MarkdownV2" });
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ No info found for "*${escapeMarkdown(animal)}*"`, { parse_mode: "MarkdownV2" });
  }
});

// ─── UNKNOWN COMMAND ──────────────────────────────────────────────────────────
bot.on("message", (msg) => {
  if (msg.text && msg.text.startsWith("/") && !msg.text.match(/^\/(start|help|search|image|weather|news|nasa|joke|define|translate|fact|movie|animal)/)) {
    bot.sendMessage(msg.chat.id, `❓ Unknown command\\. Type /help to see all available commands\\.`, { parse_mode: "MarkdownV2" });
  }
});

// ─── POLLING ERROR HANDLER ────────────────────────────────────────────────────
bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

console.log("✅ ZixieBot started! Waiting for messages...");
