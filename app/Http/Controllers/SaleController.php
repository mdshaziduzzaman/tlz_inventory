<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Support\Codes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    /**
     * Confirm a stock-out. The cart was validated in the browser when each
     * barcode was scanned, but that check is a courtesy — between the scan and
     * the click another terminal may have sold the same pair, so the authority
     * is the row lock taken here.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_id'     => ['required', 'integer', 'exists:customers,id'],
            'items'           => ['required', 'array', 'min:1', 'max:500'],
            'items.*.code'    => ['required', 'string'],
            /* A pair cannot go out at nothing. Zero is what the box shows
               before a price has been typed, so letting it through records a
               sale that earns nothing and quietly understates the takings. */
            'items.*.price'   => ['required', 'numeric', 'gt:0', 'max:99999999'],
            'discount'        => ['nullable', 'numeric', 'min:0'],
        ], [
            /* The default names the field by its array path — "items.0.price"
               means nothing at a till counter. */
            'items.*.price.gt'       => 'Every pair needs a price above zero.',
            'items.*.price.required' => 'Every pair needs a price above zero.',
        ]);

        $codes = array_column($data['items'], 'code');
        if (count($codes) !== count(array_unique($codes))) {
            return response()->json(['message' => 'The same barcode appears twice in the cart.'], 422);
        }

        /* An abort() inside the closure rolls the whole transaction back, so a
           pair that turns out to be gone cannot leave a half-written invoice. */
        $result = DB::transaction(function () use ($data, $codes, $request) {
            $customer = Customer::findOrFail($data['customer_id']);

            $products = Product::whereIn('code', $codes)
                ->lockForUpdate()
                ->get()
                ->keyBy('code');

            $priceByCode = [];
            foreach ($data['items'] as $item) {
                $priceByCode[$item['code']] = round((float) $item['price'], 2);
            }

            $sub = 0.0;
            foreach ($codes as $code) {
                $p = $products[$code] ?? null;

                if (! $p) {
                    abort(422, "Barcode not found: $code");
                }
                if ($p->status === 'out') {
                    abort(409, "Already sold by someone else: $code");
                }
                if ($p->status === 'damaged') {
                    abort(409, "Written off as damaged, cannot be sold: $code");
                }

                $sub += $priceByCode[$code];
            }

            $discount = min($sub, round((float) ($data['discount'] ?? 0), 2));
            $dateKey  = Codes::dateKey();
            $n        = Codes::bump("sale:$dateKey");

            $sale = Sale::create([
                'inv'           => 'INV-' . $dateKey . '-' . Codes::pad($n, 3),
                'customer_id'   => $customer->id,
                'customer_name' => $customer->name,
                'sub'           => $sub,
                'discount'      => $discount,
                'total'         => $sub - $discount,
                'created_by'    => $request->user()->id,
            ]);

            $now = now();
            foreach ($codes as $code) {
                $p = $products[$code];

                SaleItem::create([
                    'sale_id'    => $sale->id,
                    'product_id' => $p->id,
                    'code'       => $code,
                    'price'      => $priceByCode[$code],
                ]);

                /* The edited row price is what was actually charged, so it
                   becomes the pair's price — refunds and reports read it. */
                $p->update([
                    'price'   => $priceByCode[$code],
                    'status'  => 'out',
                    'sold_to' => $customer->id,
                    'sold_at' => $now,
                    'last_at' => $now,
                ]);
            }

            return [
                'sale'     => $sale->load('items')->toWire(),
                'products' => Product::whereIn('code', $codes)->get()->map->toWire()->all(),
            ];
        });

        return response()->json($result, 201);
    }
}
