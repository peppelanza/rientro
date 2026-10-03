// Emoji for the chat (pages/messaggi): the picker in the composer and for reactions, and the quick
// reactions bar (like WhatsApp: ❤️ 👍 😂 😮 😢 🙏). Plain Unicode, drawn by the device's own font.
export const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export const EMOJI = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋',
  '😎', '🤩', '🥳', '🤔', '🤨', '😐', '🙄', '😏', '😴', '😮', '😲', '😢', '😭', '😤', '😡', '🤯',
  '😳', '🥺', '🙏', '👍', '👎', '👏', '🙌', '👋', '🤝', '💪', '✌️', '🤞', '👌', '🫶', '❤️', '🧡',
  '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '🔥', '✨', '🎉', '💯', '✅', '❌', '☕', '🍕', '🍝',
  '🇮🇹', '🌍', '✈️', '🏠', '💡', '🚀', '📅', '📞',
];

// A message made of 1 to 3 emoji only is shown large, without a bubble (like WhatsApp)
const ONE = '(?:\\p{Regional_Indicator}{2}|\\p{Extended_Pictographic}(?:[\\u{FE0F}\\u{1F3FB}-\\u{1F3FF}\\u{20E3}]|\\u{200D}\\p{Extended_Pictographic})*)';
const ONLY = new RegExp(`^\\s*(?:${ONE}\\s*){1,3}$`, 'u');
export const isEmojiOnly = text => ONLY.test(text || '');
