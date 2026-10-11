import type { Usuario } from '@prisma/client';
import type { UsuarioDTO } from './usuario.schemas.js';

/** Iniciais exibidas no avatar: primeira letra do primeiro e do último nome. */
export function gerarIniciais(name: string): string {
  const partes = name.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}

/** Converte a entidade em DTO público — nunca expõe o hash da senha. */
export function toUsuarioDTO(usuario: Usuario): UsuarioDTO {
  return {
    id: usuario.id,
    name: usuario.name,
    email: usuario.email,
    role: usuario.role,
    department: usuario.department,
    matricula: usuario.matricula,
    initials: gerarIniciais(usuario.name),
    avatarUrl: usuario.avatarUrl,
    ativo: usuario.ativo,
    createdAt: usuario.createdAt.toISOString(),
    updatedAt: usuario.updatedAt.toISOString(),
  };
}
