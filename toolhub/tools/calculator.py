"""Safe math expression calculator."""

from __future__ import annotations

import math
import ast
import operator as op


_ALLOWED_NODES = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Call, ast.Constant, ast.Name,
)
_ALLOWED_OPS = {
    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul,
    ast.Div: op.truediv, ast.Pow: op.pow, ast.Mod: op.mod,
    ast.USub: op.neg, ast.UAdd: op.pos,
}
_ALLOWED_NAMES = {
    "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "log": math.log, "log10": math.log10, "exp": math.exp,
    "abs": abs, "round": round, "pi": math.pi, "e": math.e,
    "ceil": math.ceil, "floor": math.floor,
}


def _eval_node(node: ast.AST):
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError("Only numeric constants allowed")
    if isinstance(node, ast.BinOp):
        op_fn = _ALLOWED_OPS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        return op_fn(_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp):
        op_fn = _ALLOWED_OPS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported unary operator")
        return op_fn(_eval_node(node.operand))
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Only named functions allowed")
        fn = _ALLOWED_NAMES.get(node.func.id)
        if fn is None:
            raise ValueError(f"Unknown function: {node.func.id}")
        args = [_eval_node(a) for a in node.args]
        return fn(*args)
    if isinstance(node, ast.Name):
        val = _ALLOWED_NAMES.get(node.id)
        if val is None or not isinstance(val, (int, float)):
            raise ValueError(f"Unknown name: {node.id}")
        return val
    raise ValueError(f"Unsupported node: {type(node).__name__}")


async def calculator(expression: str) -> dict:
    """Safely evaluate a mathematical expression."""
    try:
        tree = ast.parse(expression.strip(), mode="eval")
        result = _eval_node(tree)
        return {"expression": expression, "result": result}
    except Exception as exc:
        return {"expression": expression, "error": str(exc)}
