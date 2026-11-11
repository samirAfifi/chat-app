export interface EmojiCategory {
  id: string;
  label: string;
  /** Icon shown on the category tab. */
  icon: string;
  emojis: string[];
}

const list = (s: string) => s.split(' ').filter(Boolean);

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: list(
      '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 ' +
        '🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 ' +
        '😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ' +
        '💩 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾'
    ),
  },
  {
    id: 'gestures',
    label: 'People & gestures',
    icon: '👍',
    emojis: list(
      '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ' +
        '✍️ 💅 💪 🦾 👀 👁️ 👅 👄 🧠 👶 🧒 👦 👧 🧑 👨 👩 🧔 👴 👵 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧏 👮 🧑‍💻 🧑‍🎓'
    ),
  },
  {
    id: 'hearts',
    label: 'Hearts',
    icon: '❤️',
    emojis: list(
      '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ❤️‍🔥 ❤️‍🩹 💋 💌 💐 🌹 🥀 🌷 🌸'
    ),
  },
  {
    id: 'animals',
    label: 'Animals & nature',
    icon: '🐶',
    emojis: list(
      '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🐺 🐴 🦄 🐝 🦋 ' +
        '🐌 🐞 🐢 🐍 🐙 🐬 🐳 🐟 🐠 🦈 🐊 🐘 🐫 🦒 🐎 🐑 🐐 🐈 🌵 🌲 🌴 🍀 🍁 🍂 🌻 🌞 🌙 ⭐ 🌟 ⚡ ' +
        '🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ 💧 🌊'
    ),
  },
  {
    id: 'food',
    label: 'Food & drink',
    icon: '🍔',
    emojis: list(
      '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🌽 🥕 🥔 🍞 🥐 🧀 🥚 🍳 🥞 🥓 🍗 🍖 ' +
        '🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥙 🧆 🍝 🍜 🍲 🍛 🍣 🍱 🍤 🍚 🍰 🎂 🧁 🍩 🍪 🍫 🍬 🍭 🍦 ☕ 🍵 🧃 🥤 🧋'
    ),
  },
  {
    id: 'activities',
    label: 'Activities & travel',
    icon: '⚽',
    emojis: list(
      '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🏋️ 🚴 🏊 🏆 🥇 🥈 🥉 🎮 🎲 🧩 🎯 🎳 🎸 🎹 🎤 🎧 🎬 🎨 🎉 🎊 🎈 ' +
        '🎁 🚗 🚕 🚌 🏍️ 🚲 ✈️ 🚀 🛸 🚢 🏠 🏢 🕌 🏖️ 🏝️ 🗽 🗼 🎡 🎢'
    ),
  },
  {
    id: 'objects',
    label: 'Objects & symbols',
    icon: '💡',
    emojis: list(
      '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 📷 📸 📹 📺 📻 🔋 💡 🔦 📚 📖 📝 ✏️ 📌 📎 ✂️ 🔒 🔑 🔨 🛠️ 💰 💵 💳 📦 📅 ' +
        '⏰ ⏳ 🎓 💼 🛒 ✅ ☑️ ❌ ❎ ⭕ ❗ ❓ ‼️ ⁉️ 💯 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ ➕ ➖ ✖️ ➗ ♾️ 💤 💬 💭 🔔 🔕 ⚠️ 🚫 🆗 🆕 🔝'
    ),
  },
];
