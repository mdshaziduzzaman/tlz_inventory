<?php

namespace App\Http\Controllers;

use App\Models\Size;

class SizeController extends LookupController
{
    protected function model(): string { return Size::class; }
    protected function field(): string { return 'sizes'; }
    protected function noun(): string { return 'size'; }
    protected function usedColumn(): string { return 'size'; }
}
