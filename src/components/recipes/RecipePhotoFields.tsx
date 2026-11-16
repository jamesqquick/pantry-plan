import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { validateRecipeImageFile } from "@/features/parse/parse.schemas";
import { monogram, toneFor } from "./recipe-card-utils";
import "./RecipePhotoFields.css";

export function RecipePhotoFields({
  id,
  title,
  imageUrl,
  photo,
  onPhotoChange,
  onRemove,
  disabled,
}: {
  id: string;
  title: string;
  imageUrl: string;
  photo: File | null;
  onPhotoChange: (value: File | null) => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview({ file: photo, url });
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const displayedUrl = photo && preview?.file === photo ? preview.url : imageUrl;
  const label = displayedUrl ? "Update photo" : "Add photo";

  return (
    <div className="recipe-photo-field space-y-2">
      <div className="text-sm font-medium">Recipe photo <span className="text-muted-foreground">(optional)</span></div>
      <div className={`recipe-photo-tile${displayedUrl ? "" : ` recipe-photo-fallback tone-${toneFor(title)}`}`}>
        {displayedUrl ? (
          <img src={displayedUrl} alt="" />
        ) : (
          <span className="recipe-photo-initial font-display" aria-hidden="true">{monogram(title)}</span>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="recipe-photo-control transition-[opacity,color,background-color,border-color,box-shadow,transform]"
          onClick={() => fileInput.current?.click()}
          disabled={disabled}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        >
          <Camera aria-hidden="true" /> {label}
        </Button>
        {displayedUrl && onRemove && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="recipe-photo-remove transition-[opacity,color,background-color,border-color,box-shadow,transform]"
            aria-label="Remove photo"
            title="Remove photo"
            disabled={disabled}
            onClick={() => {
              if (fileInput.current) fileInput.current.value = "";
              setError(null);
              onRemove();
            }}
          >
            <Trash2 aria-hidden="true" className="text-destructive" />
          </Button>
        )}
      </div>
      <div>
        <input
          ref={fileInput}
          id={`${id}-file`}
          type="file"
          aria-label="Photo file"
          tabIndex={-1}
          className="sr-only"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          aria-invalid={!!error}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            const validationError = file ? validateRecipeImageFile(file) : null;
            setError(validationError);
            onPhotoChange(validationError ? null : file);
            if (validationError) event.target.value = "";
          }}
        />
        <p id={`${id}-hint`} className="mt-1 text-meta text-muted-foreground">
          {photo ? `Selected: ${photo.name}. Uploads after saving.` : "JPEG, PNG, or WebP. Max 4 MB."}
        </p>
        {error && <p id={`${id}-error`} role="alert" className="mt-1 text-meta text-destructive">{error}</p>}
      </div>
    </div>
  );
}
