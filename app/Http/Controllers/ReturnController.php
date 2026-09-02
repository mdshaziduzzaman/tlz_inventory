<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Product;
use App\Models\SaleItem;
use App\Models\StockReturn;
use App\Models\StockReturnItem;
use App\Support\Codes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReturnController extends Controller
{
    /**
     * A customer return puts pairs back into stock; a damage write-off takes
     * them out permanently. Both land in stock_returns, told apart by `type`.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'type'    => ['required', 'in:return,damage'],
            'codes'   => ['required', 'array', 'min:1', 'max:500'],
            'codes.*' => ['required', 'string'],
            'reason'  => ['nullable', 'string', 'max:1000'],
        ]);

        $codes = array_values(array_unique($data['codes']));
        $isReturn = $data['type'] === 'return';

        $result = DB::transaction(function () use ($codes, $isReturn, $data, $request) {
            $products = Product::whereIn('code', $codes)
                ->lockForUpdate()
                ->get()
                ->keyBy('code');

            $amount = 0.0;
            foreach ($codes as $code) {
                $p = $products[$code] ?? null;

                if (! $p) {
                    abort(422, "Barcode not found: $code");
                }
                if ($p->status === 'damaged') {
                    abort(409, "Already written off as damaged: $code");
                }
                if ($isReturn && $p->status !== 'out') {
                    abort(409, "Not sold yet, so it cannot be returned: $code");
                }

                /* A refund hands back what the customer paid; a damage
                   write-off records the stock value lost, which is the full
                   price regardless of what it was once sold for. */
                $amount += $isReturn ? $this->refundFor($p) : (float) $p->price;
            }

            /* The buyer is taken from the first pair, matching how the screen
               summarises a mixed list. Damage of unsold stock has no buyer. */
            $first = $products[$codes[0]];
            $buyer = $first->sold_to ? Customer::find($first->sold_to) : null;

            $dateKey = Codes::dateKey();
            $prefix  = $isReturn ? 'RET' : 'DMG';
            $n       = Codes::bump(strtolower($prefix) . ":$dateKey");

            $ret = StockReturn::create([
                'ref'           => $prefix . '-' . $dateKey . '-' . Codes::pad($n, 3),
                'type'          => $data['type'],
                'customer_id'   => $buyer?->id,
                'customer_name' => $buyer?->name ?? '-',
                'reason'        => trim((string) ($data['reason'] ?? '')) ?: 'Not specified',
                'amount'        => $amount,
                'created_by'    => $request->user()->id,
            ]);

            $now = now();
            foreach ($codes as $code) {
                $p = $products[$code];

                StockReturnItem::create([
                    'stock_return_id' => $ret->id,
                    'product_id'      => $p->id,
                    'code'            => $code,
                    'price'           => $p->price,
                ]);

                if ($isReturn) {
                    $p->update([
                        'status'        => 'in',
                        'returned_from' => $p->sold_to,
                        'sold_to'       => null,
                        'sold_at'       => null,
                        'last_at'       => $now,
                    ]);
                } else {
                    $p->update(['status' => 'damaged', 'last_at' => $now]);
                }
            }

            return [
                'return'   => $ret->load('items')->toWire(),
                'products' => Product::whereIn('code', $codes)->get()->map->toWire()->all(),
            ];
        });

        return response()->json($result, 201);
    }

    /**
     * What to hand back for one returned pair: its share of what was actually
     * paid, not the price printed on the label. On a discounted invoice those
     * are different numbers, and refunding the label price pays the discount
     * out in cash — on a 100%-off line it would hand over money for something
     * the customer got free.
     */
    private function refundFor(Product $p): float
    {
        /* A pair can be sold, returned, and sold again, so the invoice that
           matters is the most recent one it appeared on. */
        $item = SaleItem::where('product_id', $p->id)
            ->orderByDesc('sale_id')
            ->first();

        if (! $item || ! $item->sale) {
            return (float) $p->price;   // no invoice on file to apportion
        }

        return $item->sale->netByCode()[$item->code] ?? (float) $item->price;
    }
}
