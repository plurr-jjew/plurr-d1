import { getImage, handleImageReact } from './library/image';
import {
  getLobbyIdByCode,
  getLobbyById,
  getLobbyByCode,
  createNewLobby,
  updateLobbyEntry,
  addImagesToLobby,
  deleteLobbyEntry,
} from './library/lobby';
import { createNewReport } from './library/report';

const routes = (
  request: Request,
  d1: D1Database,
  r2: R2Bucket,
  r2Images: any
): Route[] => [
    {
      method: 'GET',
      pathname: '/image/:lobbyId/:imageId',
      action: (params: { [key: string]: string }) => getImage(request, params.lobbyId, params.imageId, r2, r2Images),
    },
    {
      method: 'PUT',
      pathname: '/image/:id/react',
      action: (params: { [key: string]: string }) => handleImageReact(request, params.id, d1),
    },
    {
      method: 'GET',
      pathname: '/lobby-id/code/:code',
      action: (params: { [key: string]: string }) => getLobbyIdByCode(params.code, d1),
    },
    {
      method: 'GET',
      pathname: '/lobby/id/:id',
      action: (params: { [key: string]: string }) => getLobbyById(request, params.id, d1),
    },
    {
      method: 'GET',
      pathname: '/lobby/code/:code',
      action: (params: { [key: string]: string }) => getLobbyByCode(request, params.code, d1),
    },
    {
      method: 'POST',
      pathname: '/lobby',
      action: () => createNewLobby(request, d1, r2),
    },
    {
      method: 'PUT',
      pathname: '/lobby/id/:id',
      action: (params: { [key: string]: string }) => updateLobbyEntry(request, params.id, d1, r2),
    },
    {
      method: 'PUT',
      pathname: '/lobby/id/:id/upload',
      action: (params: { [key: string]: string }) => addImagesToLobby(request, params.id, d1, r2),
    },
    {
      method: 'DELETE',
      pathname: '/lobby/id/:id',
      action: (params: { [key: string]: string }) => deleteLobbyEntry(params.id, d1, r2),
    },
    {
      method: 'POST',
      pathname: '/report',
      action: () => createNewReport(request, d1),
    },
  ];

export default routes;
