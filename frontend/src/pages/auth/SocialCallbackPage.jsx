import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function SocialCallbackPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();

    useEffect(() => {
        const accessToken = searchParams.get("access_token");
        
        if (accessToken) {
            // 토큰이 있으면 로그인 처리 후 홈으로 이동
            login(accessToken).then(() => {
                navigate("/");
            });
        } else {
            // 토큰이 없으면 로그인 페이지로 이동 (에러 처리)
            alert("로그인에 실패했습니다.");
            navigate("/login");
        }
    }, [searchParams, navigate, login]);

    return (
        <div style={{ 
            height: "100vh", 
            display: "flex", 
            justifyContent: "center", 
            alignItems: "center", 
            fontSize: "1.2rem" 
        }}>
            로그인 처리 중...
        </div>
    );
}

export default SocialCallbackPage;