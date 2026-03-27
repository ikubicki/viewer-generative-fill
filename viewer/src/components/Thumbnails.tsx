interface Props {
  urls: string[];
  currentIndex: number;
  onSelect: (i: number) => void;
}

export function Thumbnails({ urls, currentIndex, onSelect }: Props) {
  return (
    <div className="thumbnails">
      {urls.map((url, i) => (
        <img
          key={url}
          src={url}
          alt={`Thumbnail ${i + 1}`}
          className={`thumb${i === currentIndex ? " active" : ""}`}
          onClick={() => onSelect(i)}
          draggable={false}
        />
      ))}
    </div>
  );
}
