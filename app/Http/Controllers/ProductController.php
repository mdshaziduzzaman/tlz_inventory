<?php

namespace App\Http\Controllers;

use App\Models\Article;
use App\Models\Color;
use App\Models\Product;
use App\Models\Size;
use App\Support\Codes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    /** Generate `qty` pairs of one variant, each with its own barcode. */
    public function store(Request $request)
    {
        /* The variant is typed on the Add Product screen rather than picked
           from a pre-built list, so it arrives as three plain strings. */
        $data = $request->validate([
            'article' => ['required', 'string', 'max:120'],
            'color'   => ['required', 'string', 'max:60'],
            'size'    => ['required', 'string', 'max:20'],
            'qty'     => ['required', 'integer', 'min:1', 'max:500'],
            'price'   => ['nullable', 'numeric', 'min:0', 'max:99999999'],
        ]);

        $qty = (int) $data['qty'];

        $made = DB::transaction(function () use ($data, $qty) {
            /* Typing a value here is what puts it on the master list, and each
               list adopts the spelling already on file — so "f01" typed today
               joins the "F01" entered last week instead of splitting the
               reports into two articles that look identical on screen. */
            $article = Article::remember(trim($data['article']));
            $color   = Color::remember(trim($data['color']));
            $size    = Size::remember(trim($data['size']));

            $dateKey = Codes::dateKey();

            /* One lock for the whole batch: the counter jumps by qty in a
               single step, so a second cashier resumes after our last code
               instead of interleaving with it. */
            $first = Codes::bump("barcode:$dateKey", $qty);

            $rows = [];
            for ($i = 0; $i < $qty; $i++) {
                $rows[] = Product::create([
                    'code'    => Codes::barcode($dateKey, $first + $i),
                    'article' => $article,
                    'color'   => $color,
                    'size'    => $size,
                    'price'   => $data['price'] ?? 0,
                    'status'  => 'in',
                ]);
            }

            return $rows;
        });

        $dateKey = Codes::dateKey();

        return response()->json([
            'products' => array_map(fn ($p) => $p->toWire(), $made),
            /* A value typed here may be new, so the client takes the refreshed
               lists back and its dropdowns offer it straight away. */
            'articles' => Article::ordered()->get()->map->toWire()->all(),
            'colors'   => Color::ordered()->get()->map->toWire()->all(),
            'sizes'    => Size::ordered()->get()->map->toWire()->all(),
            'nextCode' => Codes::barcode($dateKey, Codes::peek("barcode:$dateKey")),
        ], 201);
    }
}
