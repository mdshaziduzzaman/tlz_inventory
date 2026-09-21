<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SettingController extends Controller
{
    /** An icon is small by nature; .ico is allowed because favicons still are. */
    private const ICON_RULES = ['image', 'mimes:jpg,jpeg,png,webp,ico', 'max:2048'];

    public function update(Request $request)
    {
        $data = $request->validate([
            'app_name'    => ['required', 'string', 'max:60'],
            'tagline'     => ['nullable', 'string', 'max:80'],
            'mark'        => ['nullable', 'string', 'max:4'],
            'icon'        => self::ICON_RULES,
            'remove_icon' => ['nullable', 'boolean'],
        ]);

        DB::transaction(function () use ($request, $data) {
            Setting::put('app_name', trim($data['app_name']));
            Setting::put('tagline', trim((string) ($data['tagline'] ?? '')));
            Setting::put('mark', trim((string) ($data['mark'] ?? '')));

            /* Replacing or clearing drops the old file either way — nothing
               else points at it once the row moves on. */
            if ($request->boolean('remove_icon') || $request->hasFile('icon')) {
                Setting::forgetIcon();
            }
            if ($request->hasFile('icon')) {
                Setting::put('icon', $request->file('icon')->store(Setting::ICON_DIR, 'public'));
            }
        });

        return response()->json(['settings' => Setting::map()]);
    }
}
