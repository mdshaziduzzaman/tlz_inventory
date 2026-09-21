<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * Install-wide branding, stored one row per key.
 *
 * Read it through map(): a key that was never saved falls back to the default
 * below, so a fresh install and an upgraded one look the same and nothing has
 * to be seeded.
 */
class Setting extends Model
{
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    /** Where the icon lives inside the public disk. */
    public const ICON_DIR = 'branding';

    public const DEFAULTS = [
        'app_name' => 'StockFlow',
        'tagline'  => 'Inventory Suite',
        'mark'     => 'SF',
        'icon'     => null,
    ];

    /** Every setting, defaults filled in, with the icon as a usable path. */
    public static function map(): array
    {
        $out = self::DEFAULTS;

        foreach (self::all() as $row) {
            if (array_key_exists($row->key, $out)) {
                $out[$row->key] = $row->value;
            }
        }

        /* Blank is not a name — fall back rather than render an empty tab. */
        foreach (['app_name', 'tagline', 'mark'] as $k) {
            if (trim((string) $out[$k]) === '') {
                $out[$k] = self::DEFAULTS[$k];
            }
        }

        /* Root-relative, for the same reason article images are: Storage::url()
           builds from APP_URL and breaks the moment the host differs. */
        $out['icon'] = $out['icon'] ? '/storage/' . ltrim($out['icon'], '/') : null;

        /* Browsers hold on to a favicon hard. Without something in the URL
           that changes, a replaced icon keeps showing the old one for days. */
        $out['iconVer'] = (string) (self::find('icon')?->updated_at?->getTimestamp() ?? '');

        return $out;
    }

    public static function put(string $key, ?string $value): void
    {
        self::updateOrCreate(['key' => $key], ['value' => $value]);
    }

    /** The stored path, before map() turns it into a URL. */
    public static function iconPath(): ?string
    {
        return self::find('icon')?->value;
    }

    /** Delete the current icon file, if there is one. */
    public static function forgetIcon(): void
    {
        $path = self::iconPath();
        if ($path) {
            Storage::disk('public')->delete($path);
        }
        self::put('icon', null);
    }
}
