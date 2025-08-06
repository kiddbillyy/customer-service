const otpTemplate = (otpCode) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Código de verificación</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #f5f8fa;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.05);
    }
    .logo {
      text-align: center;
      margin-bottom: 20px;
    }
    .logo img {
      height: 50px;
    }
    .title {
      text-align: center;
      color: #333;
      font-size: 22px;
      margin-bottom: 10px;
    }
    .message {
      font-size: 16px;
      color: #555;
      text-align: center;
      margin-bottom: 30px;
    }
    .otp-box {
      text-align: center;
      background-color: #f0f4f8;
      padding: 15px;
      font-size: 28px;
      letter-spacing: 5px;
      font-weight: bold;
      border-radius: 8px;
      margin: 0 auto 30px auto;
      width: fit-content;
    }
    .footer {
      text-align: center;
      color: #999;
      font-size: 13px;
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <!-- Reemplaza con tu logo si tienes -->
      <img src="https://i.imgur.com/znV3Fds.png" alt="Mimbral Logo" />
    </div>
    <div class="title">Código de verificación</div>
    <div class="message">
      Estás intentando recuperar tu contraseña. Usa el siguiente código para continuar:
    </div>
    <div class="otp-box">${otpCode}</div>
    <div class="message">
      Este código expirará en unos minutos. Si tú no solicitaste este código, puedes ignorar este mensaje.
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} Mimbral. Todos los derechos reservados.
    </div>
  </div>
</body>
</html>
`;

module.exports = { otpTemplate };
