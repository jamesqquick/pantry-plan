import { useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { validateRecipeImageFile } from "@/features/parse/parse.schemas";

export function RecipePhotoFields({
  id,
  imageUrl,
  onImageUrlChange,
  photo,
  onPhotoChange,
  disabled,
  urlDisabled,
}: {
  id: string;
  imageUrl: string;
  onImageUrlChange: (value: string) => void;
  photo: File | null;
  onPhotoChange: (value: File | null) => void;
  disabled?: boolean;
  urlDisabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-url`} className="mb-1 block text-sm font-medium">Image URL <span className="text-muted-foreground">(optional)</span></label>
        <Input
          id={`${id}-url`}
          type="url"
          autoComplete="url"
          value={imageUrl}
          disabled={disabled || urlDisabled}
          onChange={(event) => {
            onImageUrlChange(event.target.value);
            onPhotoChange(null);
            if (fileInput.current) fileInput.current.value = "";
            setError(null);
          }}
          placeholder="https://example.com/image.jpg"
        />
      </div>
      <div>
        <label htmlFor={`${id}-file`} className="mb-1 block text-sm font-medium">Or upload a photo</label>
        <Input
          ref={fileInput}
          id={`${id}-file`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
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
