import "./thumbnail.css";

export const metadata = {
  robots: "noindex, nofollow",
  title: "Thumbnail",
};

export default function ThumbnailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
