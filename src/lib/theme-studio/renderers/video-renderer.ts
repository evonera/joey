export interface VideoSceneSpec {
  id: string;
  type: "hook" | "point" | "takeaway" | "cta";
  title: string;
  narrationText: string;
  durationInSeconds: number;
  bgMediaUrl?: string;
}

export interface RemotionCompositionProps {
  title: string;
  niche: string;
  scenes: VideoSceneSpec[];
  brandKit?: {
    primaryColor?: string;
    accentColor?: string;
    watermark?: string;
  };
  audioUrl?: string;
  fps?: number;
}

export interface WordTimestamp {
  word: string;
  startFrame: number;
  endFrame: number;
}

/**
 * Estimates spoken audio duration and creates word-level alignment for animated subtitles.
 */
export function generateWordTimestamps(
  text: string,
  startSeconds: number = 0,
  wordsPerMinute: number = 150,
  fps: number = 30
): { durationSeconds: number; totalFrames: number; words: WordTimestamp[] } {
  const cleanWords = text.trim().split(/\s+/).filter(Boolean);
  if (cleanWords.length === 0) {
    return { durationSeconds: 0, totalFrames: 0, words: [] };
  }

  const secondsPerWord = 60 / wordsPerMinute;
  const framesPerWord = Math.round(secondsPerWord * fps);

  let currentFrame = Math.round(startSeconds * fps);
  const words: WordTimestamp[] = [];

  for (const word of cleanWords) {
    words.push({
      word,
      startFrame: currentFrame,
      endFrame: currentFrame + framesPerWord,
    });
    currentFrame += framesPerWord;
  }

  const totalFrames = currentFrame - Math.round(startSeconds * fps);
  const durationSeconds = totalFrames / fps;

  return {
    durationSeconds,
    totalFrames,
    words,
  };
}

/**
 * Builds a Remotion composition payload for 9:16 vertical short-form video.
 */
export function buildVerticalNewsComposition(props: {
  title: string;
  points: string[];
  ctaKeyword?: string;
  brandKit?: { primaryColor?: string; accentColor?: string; watermark?: string };
}): RemotionCompositionProps {
  const { title, points, ctaKeyword = "GUIDE", brandKit } = props;

  const scenes: VideoSceneSpec[] = [
    {
      id: "scene_hook",
      type: "hook",
      title: title,
      narrationText: `Here is what you need to know about ${title}.`,
      durationInSeconds: 3,
    },
  ];

  points.forEach((point, idx) => {
    scenes.push({
      id: `scene_point_${idx + 1}`,
      type: "point",
      title: `Point ${idx + 1}`,
      narrationText: point,
      durationInSeconds: 6,
    });
  });

  scenes.push({
    id: "scene_cta",
    type: "cta",
    title: `Comment "${ctaKeyword}"`,
    narrationText: `Comment ${ctaKeyword} below to get our complete free breakdown sent to your direct messages.`,
    durationInSeconds: 4,
  });

  return {
    title,
    niche: "updates",
    scenes,
    brandKit,
    fps: 30,
  };
}
