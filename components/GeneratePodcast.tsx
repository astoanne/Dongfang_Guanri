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

const useGeneratePodcast = ({
  setAudio, voiceType, voicePrompt, setAudioStorageId
}: GeneratePodcastProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast()

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const { startUpload } = useUploadFiles(generateUploadUrl)
  const getPodcastAudio = useAction(api.openai.generateAudioAction)
  const getAudioUrl = useMutation(api.podcasts.getUrl);

  const generatePodcast = async () => {
    setIsGenerating(true);
    setAudio('');

    if(!voicePrompt) {
      toast({
        title: "Please provide a prompt to generate a podcast",
      })
      return setIsGenerating(false);
    }

    try {
      const response = await getPodcastAudio({
        voice: voiceType,
        input: voicePrompt
      })

      const blob = new Blob([response], { type: 'audio/mpeg' });
      const fileName = `podcast-${uuidv4()}.mp3`;
      const file = new File([blob], fileName, { type: 'audio/mpeg' });

      const uploaded = await startUpload([file]);
      const storageId = (uploaded[0].response as any).storageId;

      setAudioStorageId(storageId);

      const audioUrl = await getAudioUrl({ storageId });
      setAudio(audioUrl!);
      setIsGenerating(false);
      toast({
        title: "Podcast generated successfully",
      })
    } catch (error) {
      console.log('Error generating podcast', error)
      toast({
        title: "Error creating a podcast",
        variant: 'destructive',
      })
      setIsGenerating(false);
    }
    
  }

  return { isGenerating, generatePodcast }
}

const GeneratePodcast = (props: GeneratePodcastProps) => {
  const { isGenerating, generatePodcast } = useGeneratePodcast(props);
  const [isAiPodcast, setIsAiPodcast] = useState(true); // Toggle between AI generation and manual upload
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast()
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const { startUpload } = useUploadFiles(generateUploadUrl)
  const getAudioUrl = useMutation(api.podcasts.getUrl);

  const audioRef = useRef<HTMLInputElement>(null);

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

      // We still use the prompt as transcription or metadata, but here we just upload the file.
      const blob = await file.arrayBuffer().then((ab) => new Blob([ab], { type: file.type }));
      const uploaded = await startUpload([new File([blob], file.name, { type: file.type })]);
      const storageId = (uploaded[0].response as any).storageId;
      props.setAudioStorageId(storageId);

      const audioUrl = await getAudioUrl({ storageId });
      props.setAudio(audioUrl!);

      setIsUploading(false);
      toast({
        title: "Podcast uploaded successfully",
      })
    } catch (error) {
      console.log(error)
      toast({ title: 'Error uploading audio', variant: 'destructive'})
      setIsUploading(false);
    }
  }

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
      
      <div className="mt-5 flex flex-col gap-2.5">
        <Label className="text-16 font-bold text-white-1 ">
          Prompt/Transcription (Required)
        </Label>
        <Textarea 
          className="input-class font-light focus-visible:ring-offset-orange-1"
          placeholder='Provide text to generate or transcribe audio'
          rows={5}
          value={props.voicePrompt}
          onChange={(e) => props.setVoicePrompt(e.target.value)}
        />
      </div>

      {isAiPodcast ? (
        // AI GENERATION MODE
        <div className="mt-5 w-full max-w-[200px]">
          <Button type="submit" className="text-16 bg-orange-1 py-4 font-bold text-white-1" onClick={generatePodcast}>
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
        // UPLOAD MODE
        <div className="mt-5">
          <div className="image_div" onClick={() => audioRef.current?.click()}>
            <Input 
              type="file"
              accept="audio/*"
              className="hidden"
              ref={audioRef}
              onChange={(e) => handleUploadAudio(e)}
            />
            {!isUploading ? (
              <Image src="/icons/upload-image.svg" width={40} height={40} alt="upload" />
            ): (
              <div className="text-16 flex-center font-medium text-white-1">
                Uploading
                <Loader size={20} className="animate-spin ml-2" />
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              <h2 className="text-12 font-bold text-orange-1">
                Click to upload
              </h2>
              <p className="text-12 font-normal text-gray-1">MP3 or WAV (max. size according to your limits)</p> 
            </div>
          </div>
        </div>
      )}

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
  )
}

export default GeneratePodcast
