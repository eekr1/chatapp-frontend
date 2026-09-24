const texts = (en, tr) => ({ en, tr });

export const PROMPT_CATEGORIES = Object.freeze(['fun', 'casual', 'deep']);

export const PROMPT_CATALOG = Object.freeze([
  { id: 'fun-01', category: 'fun', text: texts('Which fictional world would you visit?', 'Hangi kurgusal dünyayı ziyaret ederdin?') },
  { id: 'fun-02', category: 'fun', text: texts('What is your most useless talent?', 'En işe yaramaz yeteneğin nedir?') },
  { id: 'fun-03', category: 'fun', text: texts('Which food could you eat for a week?', 'Bir hafta boyunca hangi yemeği yiyebilirdin?') },
  { id: 'fun-04', category: 'fun', text: texts('What would your superhero name be?', 'Süper kahraman adın ne olurdu?') },
  { id: 'fun-05', category: 'fun', text: texts('Which animal best matches your mood?', 'Ruh haline en çok hangi hayvan uyuyor?') },
  { id: 'fun-06', category: 'fun', text: texts('What song belongs in a road-trip playlist?', 'Yolculuk listesinde hangi şarkı olmalı?') },
  { id: 'fun-07', category: 'fun', text: texts('If today had a title, what would it be?', 'Bugünün bir başlığı olsa ne olurdu?') },
  { id: 'fun-08', category: 'fun', text: texts('What tiny thing always makes you laugh?', 'Hangi küçük şey seni hep güldürür?') },
  { id: 'casual-01', category: 'casual', text: texts('How has your day been so far?', 'Günün şu ana kadar nasıl geçti?') },
  { id: 'casual-02', category: 'casual', text: texts('What are you looking forward to?', 'Neyi dört gözle bekliyorsun?') },
  { id: 'casual-03', category: 'casual', text: texts('Are you more of a morning or night person?', 'Daha çok sabah mı gece insanı mısın?') },
  { id: 'casual-04', category: 'casual', text: texts('What did you last watch and enjoy?', 'En son ne izledin ve beğendin?') },
  { id: 'casual-05', category: 'casual', text: texts('What is your ideal weekend like?', 'İdeal hafta sonun nasıl olur?') },
  { id: 'casual-06', category: 'casual', text: texts('Do you have a favorite place in your city?', 'Şehrinde sevdiğin bir yer var mı?') },
  { id: 'casual-07', category: 'casual', text: texts('What helps you recharge after a long day?', 'Uzun bir günün ardından seni ne dinlendirir?') },
  { id: 'casual-08', category: 'casual', text: texts('What is something good you ate recently?', 'Son zamanlarda yediğin güzel bir şey neydi?') },
  { id: 'deep-01', category: 'deep', text: texts('What value matters most in a friendship?', 'Bir arkadaşlıkta en önemli değer nedir?') },
  { id: 'deep-02', category: 'deep', text: texts('What lesson took you a long time to learn?', 'Öğrenmen uzun süren bir ders neydi?') },
  { id: 'deep-03', category: 'deep', text: texts('When do you feel most like yourself?', 'Kendini en çok ne zaman kendin gibi hissedersin?') },
  { id: 'deep-04', category: 'deep', text: texts('What does a meaningful life look like to you?', 'Anlamlı bir hayat sana göre nasıl görünür?') },
  { id: 'deep-05', category: 'deep', text: texts('What has changed your perspective lately?', 'Son zamanlarda bakış açını ne değiştirdi?') },
  { id: 'deep-06', category: 'deep', text: texts('What do you wish people understood about you?', 'İnsanların senin hakkında neyi anlamasını isterdin?') },
  { id: 'deep-07', category: 'deep', text: texts('What makes a conversation memorable?', 'Bir sohbeti unutulmaz yapan nedir?') },
  { id: 'deep-08', category: 'deep', text: texts('What are you trying to make more time for?', 'Neye daha çok zaman ayırmaya çalışıyorsun?') }
]);

export const getPrompt = (promptId, locale = 'en') => {
  const prompt = PROMPT_CATALOG.find((entry) => entry.id === promptId);
  if (!prompt) return null;
  return { ...prompt, label: prompt.text[locale] || prompt.text.en };
};

export const getCategoryPrompts = (category = 'random') => (
  category === 'random' ? PROMPT_CATALOG : PROMPT_CATALOG.filter((entry) => entry.category === category)
);

export const chooseNextPrompt = ({ category = 'random', currentId = null, recentIds = [], random = Math.random } = {}) => {
  const source = getCategoryPrompts(category);
  const blocked = new Set([currentId, ...recentIds].filter(Boolean));
  const candidates = source.filter((entry) => !blocked.has(entry.id));
  const pool = candidates.length ? candidates : source.filter((entry) => entry.id !== currentId);
  const safePool = pool.length ? pool : source;
  const index = Math.min(safePool.length - 1, Math.floor(Math.max(0, random()) * safePool.length));
  return safePool[index]?.id || null;
};
