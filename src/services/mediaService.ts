import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase/app'
import type { TweetMedia, TweetMediaType } from '../types/tweet'

interface UploadTweetMediaOptions {
  userId: string
  file: File
}

function inferMediaType(contentType: string): TweetMediaType {
  if (contentType.startsWith('video/')) {
    return 'video'
  }
  return 'image'
}

export async function uploadTweetMedia({ userId, file }: UploadTweetMediaOptions): Promise<TweetMedia> {
  const mediaId = crypto.randomUUID()
  const safeExtension = file.name.includes('.') ? file.name.split('.').pop() ?? 'bin' : 'bin'
  const storagePath = `tweets/${userId}/${mediaId}.${safeExtension}`
  const storageRef = ref(storage, storagePath)
  await uploadBytes(storageRef, file, { contentType: file.type })
  const downloadUrl = await getDownloadURL(storageRef)

  return {
    id: mediaId,
    storagePath,
    downloadUrl,
    contentType: file.type,
    size: file.size,
    type: inferMediaType(file.type),
  }
}

export async function deleteTweetMedia(storagePath: string) {
  const storageRef = ref(storage, storagePath)
  await deleteObject(storageRef)
}

export async function deleteTweetMediaBatch(paths: string[]) {
  await Promise.all(
    paths.map(async (path) => {
      try {
        await deleteTweetMedia(path)
      } catch (error) {
        console.warn('Unable to delete media at path', path, error)
      }
    }),
  )
}
