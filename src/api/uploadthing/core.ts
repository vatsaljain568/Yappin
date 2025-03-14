import { createUploadthing, type FileRouter } from "uploadthing/next";
import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

const f = createUploadthing();

export const ourFileRouter = {
  // define routes for different upload types
  postImage: f({
    image: {
      maxFileSize: "4MB", 
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      // this code runs on your server before upload because of the middleware
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");

      return { userId };
    })

    .onUploadComplete(async ({ metadata,file }) => {
      try {
        return { fileUrl: file.url };
      } catch (error) {
        console.error("Error in onUploadComplete:", error);
        throw error;
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;