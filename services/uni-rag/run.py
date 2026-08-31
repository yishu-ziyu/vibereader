import uvicorn
from uni_rag.api.app import create_app

app = create_app()

if __name__ == "__main__":
    uvicorn.run("run:app", host="127.0.0.1", port=5001, reload=True)
