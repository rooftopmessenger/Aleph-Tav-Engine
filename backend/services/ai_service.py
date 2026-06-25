import os
import json
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional, List
import httpx

class BaseAIService(ABC):
    """
    Abstract Base Class for AI service layers to allow easy swapping 
    between local instances (Ollama) and external APIs (OpenAI/Anthropic) later.
    """
    @abstractmethod
    async def generate_stream(self, prompt: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        pass

    @abstractmethod
    async def generate_embedding(self, text: str) -> List[float]:
        pass

class OllamaService(BaseAIService):
    """
    Concrete implementation of BaseAIService connecting to a local Ollama instance.
    """
    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.model = model or os.getenv("OLLAMA_MODEL", "llama3")

    async def generate_stream(self, prompt: str, system_prompt: Optional[str] = None) -> AsyncGenerator[str, None]:
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True
        }
        if system_prompt:
            payload["system"] = system_prompt
            
        # Disable timeout entirely to handle long cold start model loading times
        async with httpx.AsyncClient(timeout=httpx.Timeout(None)) as client:
            try:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        yield f"\n[Error: Ollama returned status code {response.status_code}]"
                        return
                        
                    async for chunk in response.aiter_lines():
                        if chunk:
                            try:
                                data = json.loads(chunk)
                                token = data.get("response", "")
                                yield token
                            except json.JSONDecodeError:
                                pass
            except httpx.ConnectError as e:
                yield f"\n[Connection Error: Could not connect to local Ollama instance at {self.base_url}. Make sure Ollama is running (`ollama serve`). Details: {type(e).__name__} - {str(e) or 'Connection refused'}]"
            except httpx.TimeoutException as e:
                yield f"\n[Timeout Error: Request to Ollama timed out. The model may still be loading. Details: {type(e).__name__} - {str(e) or 'Read/Write timeout'}]"
            except httpx.RequestError as e:
                yield f"\n[Request Error: Communication failure with Ollama. Details: {type(e).__name__} - {str(e) or 'HTTP Request failed'}]"
            except Exception as e:
                yield f"\n[Error communicating with Ollama: {type(e).__name__} - {str(e) or 'Unknown error'}]"

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for the input text using local bge-m3 model.
        """
        url = f"{self.base_url}/api/embeddings"
        payload = {
            "model": "bge-m3",
            "prompt": text
        }
        # Disable timeout entirely to accommodate heavy model load times
        async with httpx.AsyncClient(timeout=httpx.Timeout(None)) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                return data["embedding"]
            except httpx.ConnectError as e:
                raise RuntimeError(
                    f"Could not connect to local Ollama instance at {self.base_url} "
                    f"to generate embedding: ConnectionError - {str(e) or 'Connection refused'}"
                )
            except httpx.TimeoutException as e:
                raise RuntimeError(
                    f"Ollama request timed out when generating embedding at {self.base_url}: "
                    f"TimeoutException - {str(e) or 'Read/Write timeout'}"
                )
            except httpx.RequestError as e:
                raise RuntimeError(
                    f"Communication failure with Ollama when generating embedding at {self.base_url}: "
                    f"RequestError - {str(e) or 'HTTP Request failed'}"
                )
            except Exception as e:
                raise RuntimeError(f"Error generating embedding from Ollama: {type(e).__name__} - {str(e) or 'Unknown error'}")
