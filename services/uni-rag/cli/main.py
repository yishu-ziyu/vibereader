"""uni-rag CLI."""
from __future__ import annotations
from pathlib import Path
import typer
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.table import Table
from uni_rag.rag.pipeline import RAGPipeline
from uni_rag.store.kb import KBStore
from uni_rag.config import load_settings
from uni_rag.api.app import create_app
import uvicorn

app = typer.Typer(help="uni-rag: 通用 RAG 助手")
kb_app = typer.Typer(help="管理本地知识库")
app.add_typer(kb_app, name="kb")
console = Console()


def _kb_store() -> KBStore:
    return KBStore(load_settings().kb_db_path)


@app.command()
def ingest(file: Path = typer.Argument(..., exists=True)):
    """上传并入库一个文档。"""
    pipeline = RAGPipeline()
    result = pipeline.ingest_file(file)
    console.print(Panel(
        f"[bold]{file.name}[/bold]\n"
        f"格式: {result['format']}\n"
        f"chunks: {result['chunks']}\n"
        f"ID: {result['source_id']}",
        title="✓ 已入库",
    ))


def _print_ingest_result(url: str, result: dict, kb_label: str | None = None) -> None:
    """Print ingest result to console (shared by ingest-url and kb ingest-url)."""
    lines = []
    if kb_label:
        lines.append(f"KB: [cyan]{kb_label}[/cyan]")
    lines.append(f"链接: [bold]{url}[/bold]")
    lines.append(f"格式: {result['format']}")
    lines.append(f"chunks: {result['chunks']}")
    lines.append(f"ID: {result['source_id']}")
    console.print(Panel("\n".join(lines), title="✓ 已入库"))


@app.command("ingest-url")
def ingest_url(url: str = typer.Argument(..., help="要提取内容的链接")):
    """从链接提取内容并入库。"""
    pipeline = RAGPipeline()
    try:
        result = pipeline.ingest_url(url)
    except Exception as e:
        console.print(f"[red]提取失败: {e}[/red]")
        raise typer.Exit(1) from e
    _print_ingest_result(url, result)


@app.command()
def ask(
    question: str = typer.Argument(...),
    session: str | None = typer.Option(None, "--session", "-s", help="会话 ID（追问用）"),
):
    """问一个问题。"""
    pipeline = RAGPipeline()
    result = pipeline.query(question, session_id=session)
    console.print(Panel(Markdown(result["answer"]), title="答"))
    if result["citations"]:
        console.print("\n[bold]引用：[/bold]")
        for c in result["citations"]:
            console.print(f"  • [cyan]{c['source']}[/cyan]" + (f" · {c['section']}" if c.get("section") else ""))
        if not session:
            console.print(f"\n[dim]提示: 用 -s <id> 追问。当前 session: {result.get('session_id', 'N/A')}[/dim]")


@kb_app.command("list")
def list_kbs():
    """列出本机所有知识库。"""
    kbs = _kb_store().list()
    if not kbs:
        console.print("[dim]暂无知识库[/dim]")
        return

    table = Table(title="知识库")
    table.add_column("ID", style="cyan")
    table.add_column("名称")
    table.add_column("说明")
    table.add_column("创建时间")
    for kb in kbs:
        table.add_row(kb["id"], kb["name"], kb["description"], kb["created_at"])
    console.print(table)


@kb_app.command("create")
def create_kb(
    name: str = typer.Argument(..., help="知识库名称；默认会转成小写 ID"),
    kb_id: str | None = typer.Option(None, "--id", help="可选：手动指定知识库 ID"),
    description: str = typer.Option("", "--description", "-d", help="知识库说明"),
):
    """创建一个知识库。"""
    try:
        kb = _kb_store().create(name, description, kb_id=kb_id)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e
    console.print(Panel(
        f"ID: [cyan]{kb['id']}[/cyan]\n名称: {kb['name']}\n说明: {kb['description']}",
        title="✓ 已创建知识库",
    ))


@kb_app.command("delete")
def delete_kb(kb_id: str = typer.Argument(..., help="要删除的知识库 ID")):
    """删除一个知识库。"""
    if not _kb_store().delete(kb_id):
        console.print(f"[red]知识库不存在: {kb_id}[/red]")
        raise typer.Exit(1)
    console.print(f"✓ 已删除知识库: [cyan]{kb_id}[/cyan]")


@kb_app.command("ingest")
def ingest_kb(
    kb_id: str = typer.Argument(..., help="目标知识库 ID"),
    file: Path = typer.Argument(..., exists=True),
):
    """把文档入库到指定知识库。"""
    if _kb_store().get(kb_id) is None:
        console.print(f"[red]知识库不存在: {kb_id}[/red]")
        raise typer.Exit(1)
    pipeline = RAGPipeline(kb_id=kb_id)
    result = pipeline.ingest_file(file)
    console.print(Panel(
        f"KB: [cyan]{kb_id}[/cyan]\n"
        f"文件: [bold]{file.name}[/bold]\n"
        f"格式: {result['format']}\n"
        f"chunks: {result['chunks']}\n"
        f"ID: {result['source_id']}",
        title="✓ 已入库",
    ))


@kb_app.command("ingest-url")
def ingest_url_kb(
    kb_id: str = typer.Argument(..., help="目标知识库 ID"),
    url: str = typer.Argument(..., help="要提取内容的链接"),
):
    """从链接提取内容并入库到指定知识库。"""
    if _kb_store().get(kb_id) is None:
        console.print(f"[red]知识库不存在: {kb_id}[/red]")
        raise typer.Exit(1)
    pipeline = RAGPipeline(kb_id=kb_id)
    try:
        result = pipeline.ingest_url(url)
    except Exception as e:
        console.print(f"[red]提取失败: {e}[/red]")
        raise typer.Exit(1) from e
    _print_ingest_result(url, result, kb_label=kb_id)


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", "-h"),
    port: int = typer.Option(8765, "--port", "-p"),
):
    """起 Web 服务。"""
    uvicorn.run("uni_rag.api.app:create_app", factory=True, host=host, port=port)


if __name__ == "__main__":
    app()
