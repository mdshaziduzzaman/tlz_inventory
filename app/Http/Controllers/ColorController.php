<?php

namespace App\Http\Controllers;

use App\Models\Color;

class ColorController extends LookupController
{
    protected function model(): string { return Color::class; }
    protected function field(): string { return 'colors'; }
    protected function noun(): string { return 'colour'; }
    protected function usedColumn(): string { return 'color'; }
}
