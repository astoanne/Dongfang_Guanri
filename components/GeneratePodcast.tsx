import { GeneratePodcastProps } from '@/types'
import React, { useRef, useState } from 'react'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Button } from './ui/button'
import { Loader } from 'lucide-react'
import { useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { v4 as uuidv4 } from 'uuid';
import { useToast } from "@/components/ui/use-toast"
import { useUploadFiles } from '@xixixao/uploadstuff/react';
import { Input } from './ui/input'
import Image from 'next/image';
import { cn } from '@/lib/utils';

/** 
 * Helper to split text at sentence boundaries into ~4000-word chunks. 
 * You can adjust the logic or the word limit as you see fit.
 */
/**
 * Splits the given text into chunks where each chunk:
 *   - Is at most `maxCharsPerChunk` in length,
 *   - Attempts to end on a sentence boundary.
 * If a single sentence exceeds that limit, it is further split 
 * into multiple sub-chunks (so you never exceed the limit).
 */
function chunkTextAtSentence(
  text: string, 
  maxCharsPerChunk = 3500
): string[] {
  // 1) Normalize line breaks and split by sentence boundary.
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/);

  let chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    // If adding this sentence to currentChunk would exceed the limit...
    if (currentChunk.length + sentence.length + 1 > maxCharsPerChunk) {
      // 1) If we already have something in currentChunk, push it
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = '';

      // 2) Handle the case where a single sentence itself is longer than the limit
      if (sentence.length > maxCharsPerChunk) {
        // Split this sentence further
        let start = 0;
        while (start < sentence.length) {
          const subchunk = sentence.slice(start, start + maxCharsPerChunk);
          chunks.push(subchunk.trim());
          start += maxCharsPerChunk;
        }
      } else {
        // Sentence fits by itself, start a new chunk
        currentChunk = sentence;
      }
    } else {
      // Sentence fits in the current chunk, just append it
      if (currentChunk.length === 0) {
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }
  }

  // 3) Push any leftover chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Helper to truncate text to `maxWords` (e.g. 200) 
 */
export function truncateText(text: string, maxWords = 200): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;

  const truncated = words.slice(0, maxWords).join(' ');
  return truncated + '...';  // no link appended
}

const useGeneratePodcast = ({
  setAudio,
  voiceType,
  voicePrompt,
  setAudioStorageId,
  setVoicePrompt,
}: GeneratePodcastProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const [progressText, setProgressText] = useState(''); // <-- track text like "Processing 1/3"

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const { startUpload } = useUploadFiles(generateUploadUrl);
  const getPodcastAudio = useAction(api.openai.generateAudioAction);
  const getAudioUrl = useMutation(api.podcasts.getUrl);

  const generatePodcast = async () => {
    setIsGenerating(true);
    setAudio('');
    setProgressText(''); // reset at start
    if (!voicePrompt) {
      toast({
        title: "Please provide a prompt to generate a podcast",
      });
      return setIsGenerating(false);
    }

    try {
      // 1) Split the prompt into ~4000-word chunks
      const chunks = chunkTextAtSentence(voicePrompt, 4000);

      let audioParts: ArrayBuffer[] = [];

      // 2) Call OpenAI for each chunk & accumulate results
      for (let i = 0; i < chunks.length; i++) {
        // Update progress text: "Processing chunk X of Y..."
        setProgressText(`Processing ${i + 1}/${chunks.length}...`);

        const response = await getPodcastAudio({
          voice: voiceType,
          input: chunks[i],
        });
        audioParts.push(response);
      }

      // 3) Concatenate all audio parts into a single Blob
      const mergedAudioBlob = new Blob(audioParts, { type: 'audio/mpeg' });
      const fileName = `podcast-${uuidv4()}.mp3`;
      const file = new File([mergedAudioBlob], fileName, { type: 'audio/mpeg' });

      // 4) Upload the combined audio
      const uploaded = await startUpload([file]);
      const storageId = (uploaded[0].response as any).storageId;
      setAudioStorageId(storageId);

      // 5) Retrieve the public URL
      const audioUrl = await getAudioUrl({ storageId });
      setAudio(audioUrl!);
      const truncated = truncateText(voicePrompt, 200);
      setVoicePrompt(truncated);
      
      setProgressText('');
      setIsGenerating(false);
      toast({
        title: "Podcast generated successfully",
      });
      
    } catch (error) {
      console.error("Error generating podcast", error);
      toast({
        title: "Error creating a podcast",
        variant: 'destructive',
      });
      setProgressText('');
      setIsGenerating(false);
    }
  }

  return { isGenerating, generatePodcast,progressText};
}

const GeneratePodcast = (props: GeneratePodcastProps) => {
  const { isGenerating, generatePodcast, progressText } = useGeneratePodcast(props);
  const [isAiPodcast, setIsAiPodcast] = useState(true); // AI generation vs manual upload
  const [isUploading, setIsUploading] = useState(false);

  const { toast } = useToast();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const { startUpload } = useUploadFiles(generateUploadUrl);
  const getAudioUrl = useMutation(api.podcasts.getUrl);

  const audioRef = useRef<HTMLInputElement>(null);

  /**
   * Handle manual audio upload
   */
  const handleUploadAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      const files = e.target.files;
      if (!files || files.length === 0) {
        setIsUploading(false);
        return;
      }

      const file = files[0];
      if (!file) {
        setIsUploading(false);
        return;
      }

      // Upload directly (we can still use `props.voicePrompt` as metadata if needed)
      const blob = await file.arrayBuffer().then((ab) => new Blob([ab], { type: file.type }));
      const uploaded = await startUpload([new File([blob], file.name, { type: file.type })]);
      const storageId = (uploaded[0].response as any).storageId;
      props.setAudioStorageId(storageId);

      const audioUrl = await getAudioUrl({ storageId });
      props.setAudio(audioUrl!);

      const truncated = truncateText(props.voicePrompt, 200);
      props.setVoicePrompt(truncated);

      
      setIsUploading(false);
      toast({
        title: "Podcast uploaded successfully",
      });
    } catch (error) {
      console.log(error);
      toast({ title: 'Error uploading audio', variant: 'destructive' });
      setIsUploading(false);
    }
  };

  return (
    <div>
      <div className="generate_thumbnail">
        <Button
          type="button"
          variant="plain"
          onClick={() => setIsAiPodcast(true)}
          className={cn('', {
            'bg-black-6': isAiPodcast
          })}
        >
          Use AI to generate Podcast
        </Button>
        <Button
          type="button"
          variant="plain"
          onClick={() => setIsAiPodcast(false)}
          className={cn('', {
            'bg-black-6': !isAiPodcast
          })}
        >
          Upload custom Audio
        </Button>
      </div>

      {/* PROMPT / TRANSCRIPTION */}
      <div className="mt-5 flex flex-col gap-2.5">
        <Label className="text-16 font-bold text-white-1 ">
          Prompt/Transcription (Required)
        </Label>
        <Textarea
          className="input-class font-light focus-visible:ring-offset-orange-1"
          placeholder="Provide text to generate or transcribe audio"
          rows={5}
          value={props.voicePrompt}
          onChange={(e) => props.setVoicePrompt(e.target.value)}
        />
      </div>

      {/* OPTIONAL PUBLIC LINK */}
      <div className="mt-5 flex flex-col gap-2.5">
        <Label className="text-16 font-bold text-white-1">
          Link (Optional)
        </Label>
        <Input
          className="input-class font-light focus-visible:ring-offset-orange-1"
          placeholder="Paste your link here"
          value={props.publicLink}
          onChange={(e) => props.setPublicLink(e.target.value)}
        />
      </div>

      {/* AI GENERATION vs. FILE UPLOAD */}
      {isAiPodcast ? (
        <div className="mt-5 w-full max-w-[200px]">
          <Button
            type="button"
            className="text-16 bg-orange-1 py-4 font-bold text-white-1"
            onClick={() => generatePodcast()}
          >
            {isGenerating ? (
              <>
                Generating
                <Loader size={20} className="animate-spin ml-2" />
              </>
            ) : (
              'Generate'
            )}
          </Button>
        </div>
      ) : (
        <div className="mt-5">
          <div className="image_div" onClick={() => audioRef.current?.click()}>
            <Input
              type="file"
              accept="audio/*"
              className="hidden"
              ref={audioRef}
              onChange={handleUploadAudio}
            />
            {!isUploading ? (
              <Image
                src="/icons/upload-image.svg"
                width={40}
                height={40}
                alt="upload"
              />
            ) : (
              <div className="text-16 flex-center font-medium text-white-1">
                Uploading
                <Loader size={20} className="animate-spin ml-2" />
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              <h2 className="text-12 font-bold text-orange-1">
                Click to upload
              </h2>
              <p className="text-12 font-normal text-gray-1">
                MP3 or WAV (max. size per your limits)
              </p>
            </div>
          </div>
        </div>
      )}
      {progressText && (
        <p className="text-white-1 mt-4 text-sm">
          {progressText}
        </p>
      )}
      {/* AUDIO PREVIEW */}
      {props.audio && (
        <audio
          controls
          src={props.audio}
          autoPlay
          className="mt-5"
          onLoadedMetadata={(e) => props.setAudioDuration(e.currentTarget.duration)}
        />
      )}

    </div>
  );
};

export default GeneratePodcast;
