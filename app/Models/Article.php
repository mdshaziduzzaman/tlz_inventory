<?php

namespace App\Models;

use Illuminate\Support\Facades\Storage;

/**
 * The article numbers the shop stocks, each optionally with a photo.
 * See LookupList for the shared list behaviour.
 */
class Article extends LookupList
{
    protected $fillable = ['label', 'image'];

    /** Where article photos live inside the public disk. */
    public const IMAGE_DIR = 'articles';

    public function toWire(): array
    {
        return [
            'id'    => $this->id,
            'label' => $this->label,
            /* Root-relative on purpose. Storage::url() builds from APP_URL,
               which pins the image to whatever host that happens to name —
               serve the app on another port and every picture 404s. The SPA
               is same-origin, so a path is both correct and portable. */
            'image' => $this->image ? '/storage/' . ltrim($this->image, '/') : null,
        ];
    }

    /** Delete the stored file, if any. Safe to call when there is none. */
    public function forgetImage(): void
    {
        if ($this->image) {
            Storage::disk('public')->delete($this->image);
            $this->image = null;
        }
    }
}
