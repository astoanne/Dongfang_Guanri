import { api } from '@/convex/_generated/api'
import { PodcastCardProps } from '@/types'
import { useMutation } from 'convex/react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import React from 'react'

const PodcastCard = ({
  imgUrl, 
  title, 
  description, 
  podcastId
}: PodcastCardProps) => {
  const router = useRouter()
  const updatePodcastViews = useMutation(api.podcasts.updatePodcastViews); 
  const handleViews = async () => { 
    try {
        // ✅ Call mutation with correct argument structure
        await updatePodcastViews({ podcastId });

        // ✅ Navigate to the podcast detail page
        router.push(`/podcasts/${podcastId}`, { scroll: true });
    } catch (error) {
        console.error("Failed to update views:", error);
    }
  };

  return (
    <div className="cursor-pointer" onClick={handleViews}>
      <figure className="flex flex-col gap-2">
        <Image 
          src={imgUrl}
          width={174}
          height={174}
          alt={title}
          className="hidden sm:block aspect-square h-fit w-full rounded-xl 2xl:size-[200px]"
        />

        

        <div className="flex flex-col">
          <h1 className="text-16 truncate font-bold text-white-1">{title}</h1>
          <h2 className="text-12 truncate font-normal capitalize text-white-4">{description}</h2>
        </div>
        <hr className="block sm:hidden border-white-4 my-1 opacity-30" />
      </figure>
    </div>
  )
}

export default PodcastCard
