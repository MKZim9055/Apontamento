var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Habilita HTTPS e redirecionamento automático
app.UseHttpsRedirection();

// Permite servir arquivos da pasta wwwroot e index.html como página inicial
app.UseDefaultFiles();
app.UseStaticFiles();

app.Run();