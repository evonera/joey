export interface MemeClip {
  id: string;
  title: string;
  category: "reaction" | "gaming_loop" | "cinema" | "streamer";
  aspectRatio: "9:16" | "16:9" | "1:1";
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl: string;
  description: string;
  tags: string[];
  attribution?: string;
}

/**
 * Curated public domain and viral stock clips for short-form video hooks,
 * hypnotic background loops, and reaction meme formats.
 */
export const CURATED_MEME_CLIPS: MemeClip[] = [
  {
    id: "homelander_stare",
    title: "Homelander Dramatic Stare",
    category: "reaction",
    aspectRatio: "16:9",
    durationSeconds: 8,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?q=80&w=600&auto=format&fit=crop",
    description: "Slow-zoom intense stare, ideal for shocking revelations, disbelief, or unhinged news.",
    tags: ["homelander", "reaction", "shocked", "intense", "dramatic"],
    attribution: "The Boys / Fair Use Meme Format",
  },
  {
    id: "pedro_pascal_laughing_crying",
    title: "Pedro Pascal Laughing to Crying",
    category: "reaction",
    aspectRatio: "16:9",
    durationSeconds: 12,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop",
    description: "Sudden transition from uncontrollable laughter to quiet devastation. Relatable emotional rollercoaster.",
    tags: ["pedro pascal", "laughing", "crying", "meme", "transition"],
  },
  {
    id: "subway_surfers_loop",
    title: "Subway Surfers Hypnotic Loop",
    category: "gaming_loop",
    aspectRatio: "9:16",
    durationSeconds: 30,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop",
    description: "High-retention mobile gameplay loop placed beneath voiceover or story clips.",
    tags: ["subway surfers", "gaming", "hypnotic", "vertical", "retention"],
  },
  {
    id: "minecraft_parkour_loop",
    title: "Minecraft Smooth Parkour",
    category: "gaming_loop",
    aspectRatio: "9:16",
    durationSeconds: 30,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1627856013091-fed6e4e30025?q=80&w=600&auto=format&fit=crop",
    description: "Fluid first-person parkour jumping loop. TikTok and Shorts retention staple.",
    tags: ["minecraft", "parkour", "satisfying", "loop", "vertical"],
  },
  {
    id: "gta_v_ramps_loop",
    title: "GTA V Mega Ramp Freefall",
    category: "gaming_loop",
    aspectRatio: "9:16",
    durationSeconds: 25,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop",
    description: "Supercar plummeting down infinite rainbow mega ramps in GTA V.",
    tags: ["gta", "car", "satisfying", "mega ramp", "retention"],
  },
  {
    id: "the_office_cringe",
    title: "Michael Scott Cringe / Regret",
    category: "reaction",
    aspectRatio: "16:9",
    durationSeconds: 6,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop",
    description: "Iconic cringe face and awkward eye dart from Michael Scott.",
    tags: ["the office", "michael scott", "cringe", "awkward", "reaction"],
  },
  {
    id: "streamer_press_conference",
    title: "Streamer / Press Conference Mic Wrap",
    category: "streamer",
    aspectRatio: "16:9",
    durationSeconds: 10,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=600&auto=format&fit=crop",
    description: "Post-match streamer or athlete press conference hot take.",
    tags: ["streamer", "press conference", "interview", "breaking", "sports"],
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

export function searchMemeClips(query: string): MemeClip[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURATED_MEME_CLIPS;
  return CURATED_MEME_CLIPS.filter((clip) => 
    clip.title.toLowerCase().includes(q) ||
    clip.description.toLowerCase().includes(q) ||
    clip.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}
