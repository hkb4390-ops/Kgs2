STUDYAPKMOD KGS — UI REFRESH

इस ZIP में मौजूदा वेबसाइट का फ्रंटएंड/API logic सुरक्षित रखा गया है और css/premium-ui.css के जरिए नया premium dark-blue responsive UI जोड़ा गया है।

GitHub से Vercel पर deploy:
1. ZIP extract करें।
2. सभी फाइलें/फोल्डर GitHub repository के root में upload करें (index.html root में होना चाहिए)।
3. Vercel में Add New Project → Import Git Repository चुनें।
4. Framework Preset: Other चुनें।
5. Build Command खाली रखें और Output Directory खाली या `.` रखें।
6. Deploy करें।

महत्वपूर्ण:
- यह static frontend package है; इसमें अलग backend/API server का source code शामिल नहीं है।
- मौजूदा JavaScript `/api/...` routes और external fallback APIs को इस्तेमाल करती है। ये routes तभी काम करेंगे जब संबंधित API backend उपलब्ध हो और CORS/permissions अनुमति दें।
- केवल static ZIP deploy करने से missing `/api/...` backend अपने-आप नहीं बन जाएगा।
- Video player एक external player URL पर निर्भर है; उसकी availability इस package के नियंत्रण में नहीं है।
