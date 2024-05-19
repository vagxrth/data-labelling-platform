import { Appbar } from "@/components/Appbar";
import { Upload } from "@/components/Upload";
import { UploadImage } from "@/components/UploadImage";
import Image from "next/image";

export default function Home() {
  return (
    <main>
      <Appbar />
      <Upload />
    </main>
  );
}
