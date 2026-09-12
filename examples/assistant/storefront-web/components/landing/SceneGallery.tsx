import Link from "next/link";
import { assistantLink } from "@/lib/navigation";
import { Arrow } from "../SiteChrome";

interface GalleryScene {
  image: string;
  alt: string;
  title: string;
  copy: string;
  prompt: string;
  coord: string;
  elev: string;
}

/**
 * Scene gallery — three large editorial photographs with slow zoom on
 * hover, replacing the old boxed 3D cards. Each opens the assistant
 * with that trip as a draft.
 */
export function SceneGallery({ scenes }: { scenes: GalleryScene[] }) {
  return (
    <section className="gallery-section" aria-label="出行场景">
      <header className="gallery-head">
        <h2 className="gallery-title" data-oval-title>
          总有一种出发，
          <br />
          是你想要的。
        </h2>
        <p className="gallery-sub">
          不必一开始就懂所有装备。选一个心仪的场景，我们从这里聊起。
        </p>
      </header>

      <div className="gallery-grid">
        {scenes.map((scene, i) => (
          <Link
            key={scene.image}
            href={assistantLink(scene.prompt)}
            className={`gallery-card is-${i + 1}`}
          >
            <div className="gallery-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/images/${scene.image}.webp`} alt={scene.alt} loading="lazy" />
            </div>
            <div className="gallery-caption">
              <span className="gallery-coord">
                {scene.coord} · {scene.elev}
              </span>
              <strong>{scene.title}</strong>
              <span className="gallery-copy">{scene.copy}</span>
              <span className="gallery-go">
                从这里聊起 <Arrow />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
