<?php

namespace App\Http\Controllers;

use App\Models\Article;
use App\Models\Color;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Role;
use App\Models\Sale;
use App\Models\Size;
use App\Models\StockReturn;
use App\Models\User;
use App\Support\Codes;
use Illuminate\Http\Request;

/**
 * One call that hands the SPA the same object it used to read out of
 * localStorage. Keeping the wire shape identical is what let the render layer
 * carry over untouched when the prototype moved onto a database.
 */
class BootstrapController extends Controller
{
    public function index(Request $request)
    {
        $me = $request->user()->load('role');

        $payload = [
            'me'        => $me->toWire(),
            'modules'   => Role::MODULES,
            'nextCode'  => $this->nextBarcode(),
            'articles'  => Article::ordered()->get()->map->toWire()->all(),
            'colors'    => Color::ordered()->get()->map->toWire()->all(),
            'sizes'     => Size::ordered()->get()->map->toWire()->all(),
            'customers' => Customer::orderBy('id')->get()->map->toWire()->all(),
            'products'  => Product::orderBy('id')->get()->map->toWire()->all(),
            'sales'     => Sale::with('items')->orderBy('id')->get()->map->toWire()->all(),
            'returns'   => StockReturn::with('items')->orderBy('id')->get()->map->toWire()->all(),
        ];

        /* The permission screens are the only place these two lists are used,
           and a role without access has no business seeing the user table. */
        $payload['roles'] = $me->allows('roleAccess') || $me->allows('userAccess')
            ? Role::orderBy('id')->get()->map(fn ($r) => [
                'id'        => $r->id,
                'name'      => $r->name,
                'perms'     => $r->perms,
                'createdAt' => $r->created_at?->toIso8601String(),
                'createdBy' => $r->created_by,
            ])->all()
            : [];

        $payload['users'] = $me->allows('userAccess')
            ? User::with('role')->orderBy('id')->get()->map(fn ($u) => [
                'id'        => $u->id,
                'code'      => $u->code,
                'name'      => $u->name,
                'username'  => $u->username,
                'roleId'    => $u->role_id,
                'disabled'  => $u->disabled,
                'createdAt' => $u->created_at?->toIso8601String(),
            ])->all()
            : [];

        return response()->json($payload);
    }

    public function nextCode()
    {
        return response()->json(['nextCode' => $this->nextBarcode()]);
    }

    private function nextBarcode(): string
    {
        $key = Codes::dateKey();

        return Codes::barcode($key, Codes::peek("barcode:$key"));
    }
}
