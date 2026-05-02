import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Acceso denegado. No se proporcionó token.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; // Podemos usar esto en el futuro si hay roles
    next();
  } catch (error) {
    return res.status(403).json({ success: false, error: 'Token inválido o expirado.' });
  }
}
