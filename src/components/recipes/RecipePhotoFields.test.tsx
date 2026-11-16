// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { RecipePhotoFields } from "./RecipePhotoFields";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function PhotoEditor({ imageUrl = "" }: { imageUrl?: string }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
  return (
    <RecipePhotoFields
      id="photo"
      title="Tomato Pasta"
      imageUrl={currentImageUrl}
      photo={photo}
      onPhotoChange={setPhoto}
      onRemove={() => {
        setPhoto(null);
        setCurrentImageUrl("");
      }}
    />
  );
}

it("shows the recipe-card placeholder and previews a selected photo before saving", async () => {
  const user = userEvent.setup();
  const objectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:selected-photo");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const { container, unmount } = render(<PhotoEditor />);

  expect(container.querySelector(".recipe-photo-fallback.tone-olive, .recipe-photo-fallback.tone-butter, .recipe-photo-fallback.tone-tomato")).toBeTruthy();
  expect(screen.getByText("Tp")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  expect(screen.queryByLabelText("Image URL")).toBeNull();

  const fileInput = screen.getByLabelText("Photo file");
  const click = vi.spyOn(fileInput, "click");
  await user.click(screen.getByRole("button", { name: "Add photo" }));
  expect(click).toHaveBeenCalledOnce();

  const file = new File(["image"], "pasta.png", { type: "image/png" });
  await user.upload(fileInput, file);
  await waitFor(() => expect(container.querySelector(".recipe-photo-tile img")?.getAttribute("src")).toBe("blob:selected-photo"));
  expect(screen.getByRole("button", { name: "Update photo" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Remove photo" }));
  expect(container.querySelector(".recipe-photo-tile img")).toBeNull();
  expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  expect(fileInput).toHaveProperty("value", "");
  expect(objectUrl).toHaveBeenCalledWith(file);
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:selected-photo");
});

it("removes an existing image, including legacy URLs", async () => {
  const user = userEvent.setup();
  const { container } = render(<PhotoEditor imageUrl="https://legacy.example/photo.jpg" />);

  expect(container.querySelector(".recipe-photo-tile img")?.getAttribute("src")).toBe("https://legacy.example/photo.jpg");
  expect(screen.getByRole("button", { name: "Update photo" })).toBeTruthy();
  expect(container.querySelector(".recipe-photo-fallback")).toBeNull();
  expect(screen.queryByLabelText("Image URL")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Remove photo" }));
  expect(container.querySelector(".recipe-photo-tile img")).toBeNull();
  expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
});
