import { buildPublicClipUrl } from "@/lib/storage";

export interface MemeClip {
  id: string;
  title: string;
  category: "reaction" | "gaming_loop" | "cinema" | "streamer" | "b_roll";
  aspectRatio: "9:16" | "16:9" | "1:1";
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl: string;
  description: string;
  tags: string[];
  quote?: string;
  speaker?: string;
  emotionTags?: string[];
  attribution?: string;
}

/**
 * Curated viral stock clips, iconic dialogue moments, streamer reactions,
 * and hypnotic background loops stored in Cloudflare R2 / public CDN.
 */
export const CURATED_MEME_CLIPS: MemeClip[] = [
  {
    id: "ishowspeed_shock_bark",
    title: "IShowSpeed Shocked Bark Reaction",
    category: "streamer",
    aspectRatio: "9:16",
    durationSeconds: 5,
    videoUrl: buildPublicClipUrl("streamers/ishowspeed_shock_bark.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=600&auto=format&fit=crop",
    description: "IShowSpeed sudden eye-widening shock leading into loud viral barking reaction.",
    tags: ["ishowspeed", "speed", "streamer", "bark", "shock", "rage", "reaction"],
    quote: "WHAT?! ARE YOU SERIOUS?!",
    speaker: "IShowSpeed",
    emotionTags: ["shock", "rage", "hysterical"],
    attribution: "IShowSpeed Highlights / Fair Use Meme Format",
  },
  {
    id: "kai_cenat_celebration_hype",
    title: "Kai Cenat Hype Celebration Jump",
    category: "streamer",
    aspectRatio: "9:16",
    durationSeconds: 7,
    videoUrl: buildPublicClipUrl("streamers/kai_cenat_celebration_hype.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?q=80&w=600&auto=format&fit=crop",
    description: "Kai Cenat jumping out of his gaming chair celebrating a massive win with chat.",
    tags: ["kai cenat", "streamer", "celebration", "hype", "win", "twitch"],
    quote: "LET'S GOOOOO! WE ACTUALLY DID IT!",
    speaker: "Kai Cenat",
    emotionTags: ["celebration", "hype", "joy"],
    attribution: "Kai Cenat Live / Fair Use Meme Format",
  },
  {
    id: "jynxzi_headset_slam_rage",
    title: "Jynxzi Headset Slam Rage",
    category: "streamer",
    aspectRatio: "9:16",
    durationSeconds: 6,
    videoUrl: buildPublicClipUrl("streamers/jynxzi_headset_slam_rage.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop",
    description: "Jynxzi slamming headset onto desk in comedic over-the-top gaming disbelief.",
    tags: ["jynxzi", "rage", "streamer", "gaming", "headset slam", "reaction"],
    quote: "YOU CANNOT BE SERIOUS RIGHT NOW!",
    speaker: "Jynxzi",
    emotionTags: ["rage", "shock", "frustration"],
    attribution: "Jynxzi Clips / Fair Use Meme Format",
  },
  {
    id: "the_office_parkour",
    title: "The Office - Parkour! Extreme Parkour!",
    category: "cinema",
    aspectRatio: "16:9",
    durationSeconds: 7,
    videoUrl: buildPublicClipUrl("cinema/the_office_parkour.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop",
    description: "Michael Scott, Dwight, and Andy doing absurd parkour off office furniture.",
    tags: ["the office", "michael scott", "parkour", "comedy", "quote"],
    quote: "Parkour! Extreme Parkour!",
    speaker: "Michael Scott",
    emotionTags: ["comedy", "chaos", "absurd"],
    attribution: "The Office (NBC) / Subtitle Scene Index",
  },
  {
    id: "breaking_bad_i_am_the_danger",
    title: "Breaking Bad - I Am The Danger",
    category: "cinema",
    aspectRatio: "16:9",
    durationSeconds: 8,
    videoUrl: buildPublicClipUrl("cinema/breaking_bad_i_am_the_danger.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=600&auto=format&fit=crop",
    description: "Walter White delivers his iconic monologue: 'I am the one who knocks'.",
    tags: ["breaking bad", "walter white", "danger", "monologue", "iconic", "quote"],
    quote: "I am not in danger, Skyler. I am the danger.",
    speaker: "Walter White",
    emotionTags: ["intense", "chilling", "smug"],
    attribution: "Breaking Bad (AMC) / Subtitle Scene Index",
  },
  {
    id: "homelander_stare",
    title: "Homelander Dramatic Stare",
    category: "reaction",
    aspectRatio: "16:9",
    durationSeconds: 8,
    videoUrl: buildPublicClipUrl("cinema/homelander_stare.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?q=80&w=600&auto=format&fit=crop",
    description: "Slow-zoom intense stare, ideal for shocking revelations, disbelief, or unhinged news.",
    tags: ["homelander", "reaction", "shocked", "intense", "dramatic"],
    quote: "You think you're in charge?",
    speaker: "Homelander",
    emotionTags: ["shock", "intense", "smug"],
    attribution: "The Boys / Fair Use Meme Format",
  },
  {
    id: "pedro_pascal_laughing_crying",
    title: "Pedro Pascal Laughing to Crying",
    category: "reaction",
    aspectRatio: "16:9",
    durationSeconds: 12,
    videoUrl: buildPublicClipUrl("cinema/pedro_pascal_laughing_crying.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop",
    description: "Sudden transition from uncontrollable laughter to quiet devastation. Relatable emotional rollercoaster.",
    tags: ["pedro pascal", "laughing", "crying", "meme", "transition"],
    quote: "It was so funny until it wasn't.",
    speaker: "Pedro Pascal",
    emotionTags: ["laugh", "crying", "transition"],
    attribution: "Community Read / Fair Use Meme Format",
  },
  {
    id: "subway_surfers_loop",
    title: "Subway Surfers Hypnotic Loop",
    category: "gaming_loop",
    aspectRatio: "9:16",
    durationSeconds: 30,
    videoUrl: buildPublicClipUrl("loops/subway_surfers_loop.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop",
    description: "High-retention mobile gameplay loop placed beneath voiceover or story clips.",
    tags: ["subway surfers", "gaming", "hypnotic", "vertical", "retention"],
    emotionTags: ["hypnotic", "focus"],
    attribution: "Public Retention Gameplay",
  },
  {
    id: "minecraft_parkour_loop",
    title: "Minecraft Smooth Parkour",
    category: "gaming_loop",
    aspectRatio: "9:16",
    durationSeconds: 30,
    videoUrl: buildPublicClipUrl("loops/minecraft_parkour_loop.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1627856013091-fed6e4e30025?q=80&w=600&auto=format&fit=crop",
    description: "Fluid first-person parkour jumping loop. TikTok and Shorts retention staple.",
    tags: ["minecraft", "parkour", "satisfying", "loop", "vertical"],
    emotionTags: ["satisfying", "hypnotic"],
    attribution: "Public Domain Minecraft Run",
  },
  {
    id: "gta_v_ramps_loop",
    title: "GTA V Mega Ramp Freefall",
    category: "gaming_loop",
    aspectRatio: "9:16",
    durationSeconds: 25,
    videoUrl: buildPublicClipUrl("loops/gta_v_ramps_loop.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop",
    description: "Supercar plummeting down infinite rainbow mega ramps in GTA V.",
    tags: ["gta", "car", "satisfying", "mega ramp", "retention"],
    emotionTags: ["satisfying", "adrenaline"],
    attribution: "Public Gameplay Stunt",
  },
  {
    id: "the_office_cringe",
    title: "Michael Scott Cringe / Regret",
    category: "reaction",
    aspectRatio: "16:9",
    durationSeconds: 6,
    videoUrl: buildPublicClipUrl("cinema/the_office_cringe.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop",
    description: "Iconic cringe face and awkward eye dart from Michael Scott.",
    tags: ["the office", "michael scott", "cringe", "awkward", "reaction"],
    quote: "No God, please no! NO! NO! NOOOOO!",
    speaker: "Michael Scott",
    emotionTags: ["cringe", "awkward", "regret"],
    attribution: "The Office (NBC) / Subtitle Scene Index",
  },
  {
    id: "aesthetic_tokyo_rain",
    title: "Tokyo Cyberpunk Rain Timelapse",
    category: "b_roll",
    aspectRatio: "9:16",
    durationSeconds: 15,
    videoUrl: buildPublicClipUrl("b-roll/aesthetic_tokyo_rain.mp4"),
    thumbnailUrl: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=600&auto=format&fit=crop",
    description: "Moody vertical city rain timelapse for faceless motivation and reflective quotes.",
    tags: ["tokyo", "rain", "cyberpunk", "aesthetic", "b-roll", "vertical", "motivation"],
    emotionTags: ["reflective", "calm", "aesthetic"],
    attribution: "Coverr / Pexels Public Creative Commons",
  },
];

export function getCuratedMemeClips(): MemeClip[] {
  return CURATED_MEME_CLIPS;
}

export function getMemeClipById(id: string): MemeClip | undefined {
  return CURATED_MEME_CLIPS.find((clip) => clip.id === id);
}

export function getClipsByCategory(category: MemeClip["category"]): MemeClip[] {
  return CURATED_MEME_CLIPS.filter((clip) => clip.category === category);
}

/**
 * Enhanced search matching against title, description, tags, quote dialogue,
 * speaker name, and emotion tags.
 */
export function searchMemeClips(query: string): MemeClip[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURATED_MEME_CLIPS;
  return CURATED_MEME_CLIPS.filter((clip) => 
    clip.title.toLowerCase().includes(q) ||
    clip.description.toLowerCase().includes(q) ||
    (clip.quote && clip.quote.toLowerCase().includes(q)) ||
    (clip.speaker && clip.speaker.toLowerCase().includes(q)) ||
    clip.tags.some((tag) => tag.toLowerCase().includes(q)) ||
    (clip.emotionTags && clip.emotionTags.some((emo) => emo.toLowerCase().includes(q)))
  );
}
