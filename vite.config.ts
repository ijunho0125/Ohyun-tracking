import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createCharacterApi } from './server/character-api';
export default defineConfig({
  plugins: [react(), {
    name: 'shared-characters',
    configureServer(server) {
      const api=createCharacterApi();
      server.middlewares.use((req,res,next)=>{void api.handle(req,res).then(handled=>{if(!handled)next();}).catch(next);});
      server.httpServer?.on('close',api.close);
      server.watcher.add('server/character-api.ts');
    },
    configurePreviewServer(server) {
      const api=createCharacterApi();
      server.middlewares.use((req,res,next)=>{void api.handle(req,res).then(handled=>{if(!handled)next();}).catch(next);});
      server.httpServer.on('close',api.close);
    },
  }],
  server: { port: 5173, strictPort: true, watch:{ignored:['**/.character-data/**']} },
  build: { target: 'es2022' },
});
