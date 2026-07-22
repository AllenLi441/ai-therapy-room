import type { Metadata } from "next";
import { DatasetStudio } from "@/components/dataset-studio/dataset-studio";

export const metadata: Metadata = {
  title: "数据集构建与盲评工作台 · 静室",
  description: "本地优先的数据集作者卡与人工盲评环境，不调用模型或上传标注内容。",
  robots: { index: false, follow: false, noarchive: true },
};

export default function DatasetStudioPage() {
  return <DatasetStudio />;
}
